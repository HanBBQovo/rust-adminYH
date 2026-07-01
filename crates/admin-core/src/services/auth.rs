use std::{
    collections::HashMap,
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

use uuid::Uuid;

use crate::{
    auth::{LegacyMd5PasswordVerifier, PasswordVerifier},
    domain::AuthUser,
    dto::{CurrentUserResponse, LoginRequest, LoginResponse},
    AppError, AppResult,
};

pub type ServiceFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait AuthService: Send + Sync {
    fn login<'a>(&'a self, input: LoginRequest) -> ServiceFuture<'a, AppResult<LoginResponse>>;

    fn current_user<'a>(
        &'a self,
        token: &'a str,
    ) -> ServiceFuture<'a, AppResult<CurrentUserResponse>>;
}

pub trait AuthUserStore: Send + Sync {
    fn find_by_name<'a>(&'a self, name: &'a str) -> ServiceFuture<'a, AppResult<Option<AuthUser>>>;

    fn save_token<'a>(&'a self, user_id: i64, token: &'a str) -> ServiceFuture<'a, AppResult<()>>;

    fn find_by_token<'a>(
        &'a self,
        token: &'a str,
    ) -> ServiceFuture<'a, AppResult<Option<AuthUser>>>;
}

pub trait TokenIssuer: Send + Sync {
    fn issue(&self, user: &AuthUser) -> AppResult<String>;
}

pub struct CompatAuthService {
    users: Arc<dyn AuthUserStore>,
    password_verifier: Arc<dyn PasswordVerifier>,
    token_issuer: Arc<dyn TokenIssuer>,
}

impl CompatAuthService {
    pub fn new(
        users: Arc<dyn AuthUserStore>,
        password_verifier: Arc<dyn PasswordVerifier>,
        token_issuer: Arc<dyn TokenIssuer>,
    ) -> Self {
        Self {
            users,
            password_verifier,
            token_issuer,
        }
    }
}

impl AuthService for CompatAuthService {
    fn login<'a>(&'a self, input: LoginRequest) -> ServiceFuture<'a, AppResult<LoginResponse>> {
        let users = Arc::clone(&self.users);
        let password_verifier = Arc::clone(&self.password_verifier);
        let token_issuer = Arc::clone(&self.token_issuer);

        Box::pin(async move {
            if input.name.trim().is_empty() || input.password.is_empty() {
                return Err(AppError::Validation("账号和密码不能为空".to_owned()));
            }

            let user = users
                .find_by_name(input.name.trim())
                .await?
                .ok_or_else(|| {
                    AppError::LegacyAuth("用户不存在，请检查您的账号是否正确！".to_owned())
                })?;

            if !password_verifier.verify(&input.password, &user.password_hash) {
                return Err(AppError::LegacyAuth(
                    "密码错误，请重新输入密码尝试登录！".to_owned(),
                ));
            }

            let token = token_issuer.issue(&user)?;
            users.save_token(user.id, &token).await?;

            Ok(LoginResponse {
                id: user.id,
                name: user.name,
                token,
            })
        })
    }

    fn current_user<'a>(
        &'a self,
        token: &'a str,
    ) -> ServiceFuture<'a, AppResult<CurrentUserResponse>> {
        let users = Arc::clone(&self.users);

        Box::pin(async move {
            if token.trim().is_empty() {
                return Err(AppError::Unauthorized);
            }

            let user = users.find_by_token(token.trim()).await?.ok_or_else(|| {
                AppError::LegacyAuth("无效的token或登录已失效！请重新登录~".to_owned())
            })?;

            Ok(CurrentUserResponse {
                id: user.id,
                name: user.name,
                roles: user.role_ids.iter().map(ToString::to_string).collect(),
                role_ids: user.role_ids,
            })
        })
    }
}

#[derive(Debug, Default)]
pub struct DisabledAuthService;

impl AuthService for DisabledAuthService {
    fn login<'a>(&'a self, _input: LoginRequest) -> ServiceFuture<'a, AppResult<LoginResponse>> {
        Box::pin(async {
            Err(AppError::Database(
                "认证服务尚未连接数据库用户仓储".to_owned(),
            ))
        })
    }

    fn current_user<'a>(
        &'a self,
        _token: &'a str,
    ) -> ServiceFuture<'a, AppResult<CurrentUserResponse>> {
        Box::pin(async {
            Err(AppError::Database(
                "认证服务尚未连接数据库用户仓储".to_owned(),
            ))
        })
    }
}

#[derive(Debug, Clone)]
pub struct DevelopmentTokenIssuer {
    prefix: String,
}

impl DevelopmentTokenIssuer {
    pub fn new(prefix: impl Into<String>) -> Self {
        Self {
            prefix: prefix.into(),
        }
    }
}

impl Default for DevelopmentTokenIssuer {
    fn default() -> Self {
        Self::new("dev")
    }
}

impl TokenIssuer for DevelopmentTokenIssuer {
    fn issue(&self, user: &AuthUser) -> AppResult<String> {
        Ok(format!("{}-{}-{}", self.prefix, user.id, Uuid::new_v4()))
    }
}

#[derive(Debug, Default)]
pub struct InMemoryAuthUserStore {
    users_by_name: Mutex<HashMap<String, AuthUser>>,
    tokens_by_user_id: Mutex<HashMap<i64, String>>,
}

impl InMemoryAuthUserStore {
    pub fn new(users: impl IntoIterator<Item = AuthUser>) -> Self {
        Self {
            users_by_name: Mutex::new(
                users
                    .into_iter()
                    .map(|user| (user.name.clone(), user))
                    .collect(),
            ),
            tokens_by_user_id: Mutex::new(HashMap::new()),
        }
    }

    pub fn single_legacy_user(id: i64, name: impl Into<String>, password: &str) -> Self {
        Self::new([AuthUser::with_legacy_md5_password(id, name, password).with_role_ids([1])])
    }

    pub fn saved_token(&self, user_id: i64) -> AppResult<Option<String>> {
        Ok(self
            .tokens_by_user_id
            .lock()
            .map_err(|_| AppError::Internal)?
            .get(&user_id)
            .cloned())
    }
}

impl AuthUserStore for InMemoryAuthUserStore {
    fn find_by_name<'a>(&'a self, name: &'a str) -> ServiceFuture<'a, AppResult<Option<AuthUser>>> {
        Box::pin(async move {
            Ok(self
                .users_by_name
                .lock()
                .map_err(|_| AppError::Internal)?
                .get(name)
                .cloned())
        })
    }

    fn save_token<'a>(&'a self, user_id: i64, token: &'a str) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            self.tokens_by_user_id
                .lock()
                .map_err(|_| AppError::Internal)?
                .insert(user_id, token.to_owned());
            Ok(())
        })
    }

    fn find_by_token<'a>(
        &'a self,
        token: &'a str,
    ) -> ServiceFuture<'a, AppResult<Option<AuthUser>>> {
        Box::pin(async move {
            let user_id = self
                .tokens_by_user_id
                .lock()
                .map_err(|_| AppError::Internal)?
                .iter()
                .find_map(|(user_id, saved_token)| (saved_token == token).then_some(*user_id));

            let Some(user_id) = user_id else {
                return Ok(None);
            };

            Ok(self
                .users_by_name
                .lock()
                .map_err(|_| AppError::Internal)?
                .values()
                .find(|user| user.id == user_id)
                .cloned())
        })
    }
}

pub fn development_auth_service(users: Arc<dyn AuthUserStore>) -> CompatAuthService {
    CompatAuthService::new(
        users,
        Arc::new(LegacyMd5PasswordVerifier),
        Arc::new(DevelopmentTokenIssuer::default()),
    )
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use crate::{
        dto::LoginRequest,
        services::{development_auth_service, AuthService, InMemoryAuthUserStore},
    };

    #[tokio::test]
    async fn compat_auth_service_accepts_legacy_md5_password() {
        let store = Arc::new(InMemoryAuthUserStore::single_legacy_user(
            58, "admin", "secret",
        ));
        let service = development_auth_service(store.clone());

        let response = service
            .login(LoginRequest {
                name: "admin".to_owned(),
                password: "secret".to_owned(),
                code: None,
            })
            .await
            .expect("legacy password should authenticate");

        assert_eq!(response.id, 58);
        assert_eq!(response.name, "admin");
        assert!(response.token.starts_with("dev-58-"));
        assert_eq!(store.saved_token(58).unwrap(), Some(response.token));
    }

    #[tokio::test]
    async fn compat_auth_service_rejects_bad_password_with_legacy_error() {
        let store = Arc::new(InMemoryAuthUserStore::single_legacy_user(
            58, "admin", "secret",
        ));
        let service = development_auth_service(store);

        let error = service
            .login(LoginRequest {
                name: "admin".to_owned(),
                password: "wrong".to_owned(),
                code: None,
            })
            .await
            .expect_err("bad password should fail");

        assert_eq!(error.legacy_code(), -200);
        assert_eq!(error.to_string(), "密码错误，请重新输入密码尝试登录！");
    }

    #[tokio::test]
    async fn current_user_returns_user_for_saved_token() {
        let store = Arc::new(InMemoryAuthUserStore::single_legacy_user(
            58, "admin", "secret",
        ));
        let service = development_auth_service(store);

        let login = service
            .login(LoginRequest {
                name: "admin".to_owned(),
                password: "secret".to_owned(),
                code: None,
            })
            .await
            .expect("login should authenticate");
        let current_user = service
            .current_user(&login.token)
            .await
            .expect("saved token should resolve");

        assert_eq!(current_user.id, 58);
        assert_eq!(current_user.name, "admin");
        assert_eq!(current_user.roles, ["1"]);
        assert_eq!(current_user.role_ids, [1]);
    }

    #[tokio::test]
    async fn second_login_invalidates_previous_token() {
        let store = Arc::new(InMemoryAuthUserStore::single_legacy_user(
            58, "admin", "secret",
        ));
        let service = development_auth_service(store);

        let first = service
            .login(LoginRequest {
                name: "admin".to_owned(),
                password: "secret".to_owned(),
                code: None,
            })
            .await
            .expect("first login should authenticate");
        let second = service
            .login(LoginRequest {
                name: "admin".to_owned(),
                password: "secret".to_owned(),
                code: None,
            })
            .await
            .expect("second login should authenticate");

        assert_ne!(first.token, second.token);
        let error = service
            .current_user(&first.token)
            .await
            .expect_err("old token should be invalid after second login");

        assert_eq!(error.legacy_code(), -200);
        assert_eq!(error.to_string(), "无效的token或登录已失效！请重新登录~");
        assert_eq!(service.current_user(&second.token).await.unwrap().id, 58);
    }

    #[tokio::test]
    async fn current_user_rejects_unknown_token() {
        let store = Arc::new(InMemoryAuthUserStore::single_legacy_user(
            58, "admin", "secret",
        ));
        let service = development_auth_service(store);

        let error = service
            .current_user("missing-token")
            .await
            .expect_err("unknown token should fail");

        assert_eq!(error.legacy_code(), -200);
        assert_eq!(error.to_string(), "无效的token或登录已失效！请重新登录~");
    }
}

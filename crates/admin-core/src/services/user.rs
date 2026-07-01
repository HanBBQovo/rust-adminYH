use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

use crate::{
    auth::legacy_md5_hex,
    dto::{
        AvatarInfo, AvatarUploadInput, LegacyUserRecord, UserCreateRequest, UserDetailResponse,
        UserListItemResponse, UserListRequest, UserListResponse, UserPasswordRequest,
        UserRoleRecord, UserUpdateRequest,
    },
    AppError, AppResult,
};

pub type ServiceFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait UserService: Send + Sync {
    fn list<'a>(&'a self, input: UserListRequest)
        -> ServiceFuture<'a, AppResult<UserListResponse>>;

    fn detail<'a>(
        &'a self,
        user_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<UserDetailResponse>>>;

    fn create<'a>(&'a self, input: UserCreateRequest) -> ServiceFuture<'a, AppResult<()>>;

    fn update<'a>(
        &'a self,
        user_id: i64,
        input: UserUpdateRequest,
    ) -> ServiceFuture<'a, AppResult<()>>;

    fn update_password<'a>(
        &'a self,
        user_id: i64,
        input: UserPasswordRequest,
    ) -> ServiceFuture<'a, AppResult<()>>;

    fn remove<'a>(&'a self, user_id: i64) -> ServiceFuture<'a, AppResult<()>>;

    fn avatar<'a>(&'a self, user_id: i64) -> ServiceFuture<'a, AppResult<Option<AvatarInfo>>>;

    fn update_avatar<'a>(
        &'a self,
        user_id: i64,
        input: AvatarUploadInput,
    ) -> ServiceFuture<'a, AppResult<AvatarInfo>>;
}

pub trait UserStore: Send + Sync {
    fn list<'a>(
        &'a self,
        input: &'a UserListRequest,
    ) -> ServiceFuture<'a, AppResult<Vec<LegacyUserRecord>>>;

    fn count<'a>(&'a self, input: &'a UserListRequest) -> ServiceFuture<'a, AppResult<usize>>;

    fn find_by_id<'a>(
        &'a self,
        user_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<LegacyUserRecord>>>;

    fn find_by_name<'a>(
        &'a self,
        name: &'a str,
    ) -> ServiceFuture<'a, AppResult<Option<LegacyUserRecord>>>;

    fn create<'a>(&'a self, input: UserCreateRequest) -> ServiceFuture<'a, AppResult<()>>;

    fn update<'a>(
        &'a self,
        user_id: i64,
        input: UserUpdateRequest,
    ) -> ServiceFuture<'a, AppResult<()>>;

    fn update_password<'a>(
        &'a self,
        user_id: i64,
        password_hash: &'a str,
    ) -> ServiceFuture<'a, AppResult<()>>;

    fn remove<'a>(&'a self, user_id: i64) -> ServiceFuture<'a, AppResult<()>>;

    fn avatar<'a>(&'a self, user_id: i64) -> ServiceFuture<'a, AppResult<Option<AvatarInfo>>>;

    fn update_avatar<'a>(
        &'a self,
        user_id: i64,
        input: AvatarUploadInput,
    ) -> ServiceFuture<'a, AppResult<AvatarInfo>>;
}

pub struct CompatUserService {
    store: Arc<dyn UserStore>,
}

impl CompatUserService {
    pub fn new(store: Arc<dyn UserStore>) -> Self {
        Self { store }
    }
}

impl UserService for CompatUserService {
    fn list<'a>(
        &'a self,
        input: UserListRequest,
    ) -> ServiceFuture<'a, AppResult<UserListResponse>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let list = store
                .list(&input)
                .await?
                .into_iter()
                .map(UserListItemResponse::from)
                .collect();
            let total_count = store.count(&input).await?;
            Ok(UserListResponse { list, total_count })
        })
    }

    fn detail<'a>(
        &'a self,
        user_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<UserDetailResponse>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            Ok(store
                .find_by_id(user_id)
                .await?
                .map(UserDetailResponse::from))
        })
    }

    fn create<'a>(&'a self, input: UserCreateRequest) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            normalize_new_user(&input)?;
            if store.find_by_name(input.name.trim()).await?.is_some() {
                return Err(AppError::Validation("用户已存在".to_owned()));
            }
            store
                .create(UserCreateRequest {
                    name: input.name.trim().to_owned(),
                    password: legacy_md5_hex(input.password.as_bytes()).to_owned(),
                    role_id: input.role_id,
                })
                .await
        })
    }

    fn update<'a>(
        &'a self,
        user_id: i64,
        input: UserUpdateRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            if input.name.trim().is_empty() {
                return Err(AppError::Validation("用户名不能为空！".to_owned()));
            }
            if input.role_id <= 0 {
                return Err(AppError::Validation("权限角色不能为空！".to_owned()));
            }
            store
                .update(
                    user_id,
                    UserUpdateRequest {
                        name: input.name.trim().to_owned(),
                        role_id: input.role_id,
                    },
                )
                .await
        })
    }

    fn update_password<'a>(
        &'a self,
        user_id: i64,
        input: UserPasswordRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let password = input.password();
            if password.is_empty() {
                return Err(AppError::Validation("密码不能为空！".to_owned()));
            }
            let password_hash = legacy_md5_hex(password.as_bytes());
            store.update_password(user_id, &password_hash).await
        })
    }

    fn remove<'a>(&'a self, user_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            if user_id == 58 {
                return Err(AppError::LegacyAuth("删除用户失败！".to_owned()));
            }
            store.remove(user_id).await
        })
    }

    fn avatar<'a>(&'a self, user_id: i64) -> ServiceFuture<'a, AppResult<Option<AvatarInfo>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move { store.avatar(user_id).await })
    }

    fn update_avatar<'a>(
        &'a self,
        user_id: i64,
        input: AvatarUploadInput,
    ) -> ServiceFuture<'a, AppResult<AvatarInfo>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move { store.update_avatar(user_id, input).await })
    }
}

#[derive(Debug, Default)]
pub struct DisabledUserService;

impl UserService for DisabledUserService {
    fn list<'a>(
        &'a self,
        _input: UserListRequest,
    ) -> ServiceFuture<'a, AppResult<UserListResponse>> {
        Box::pin(async {
            Err(AppError::Database("用户服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn detail<'a>(
        &'a self,
        _user_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<UserDetailResponse>>> {
        Box::pin(async {
            Err(AppError::Database("用户服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn create<'a>(&'a self, _input: UserCreateRequest) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("用户服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn update<'a>(
        &'a self,
        _user_id: i64,
        _input: UserUpdateRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("用户服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn update_password<'a>(
        &'a self,
        _user_id: i64,
        _input: UserPasswordRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("用户服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn remove<'a>(&'a self, _user_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("用户服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn avatar<'a>(&'a self, _user_id: i64) -> ServiceFuture<'a, AppResult<Option<AvatarInfo>>> {
        Box::pin(async {
            Err(AppError::Database("用户服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn update_avatar<'a>(
        &'a self,
        _user_id: i64,
        _input: AvatarUploadInput,
    ) -> ServiceFuture<'a, AppResult<AvatarInfo>> {
        Box::pin(async {
            Err(AppError::Database("用户服务尚未连接数据库仓储".to_owned()))
        })
    }
}

#[derive(Debug)]
pub struct InMemoryUserStore {
    users: Mutex<Vec<LegacyUserRecord>>,
    avatars: Mutex<Vec<AvatarInfo>>,
    next_id: Mutex<i64>,
}

impl InMemoryUserStore {
    pub fn with_seed_data() -> Self {
        Self {
            users: Mutex::new(vec![
                LegacyUserRecord::new(58, "admin", "secret", UserRoleRecord::admin()),
                LegacyUserRecord::new(59, "operator", "secret", UserRoleRecord::operator()),
            ]),
            avatars: Mutex::new(vec![
                AvatarInfo::default_for_user(58),
                AvatarInfo::default_for_user(59),
            ]),
            next_id: Mutex::new(60),
        }
    }
}

impl Default for InMemoryUserStore {
    fn default() -> Self {
        Self {
            users: Mutex::new(Vec::new()),
            avatars: Mutex::new(Vec::new()),
            next_id: Mutex::new(1),
        }
    }
}

impl UserStore for InMemoryUserStore {
    fn list<'a>(
        &'a self,
        input: &'a UserListRequest,
    ) -> ServiceFuture<'a, AppResult<Vec<LegacyUserRecord>>> {
        Box::pin(async move {
            Ok(
                filter_users(&self.users.lock().map_err(|_| AppError::Internal)?, input)
                    .into_iter()
                    .skip(input.offset)
                    .take(input.size)
                    .collect(),
            )
        })
    }

    fn count<'a>(&'a self, input: &'a UserListRequest) -> ServiceFuture<'a, AppResult<usize>> {
        Box::pin(async move {
            Ok(filter_users(&self.users.lock().map_err(|_| AppError::Internal)?, input).len())
        })
    }

    fn find_by_id<'a>(
        &'a self,
        user_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<LegacyUserRecord>>> {
        Box::pin(async move {
            Ok(self
                .users
                .lock()
                .map_err(|_| AppError::Internal)?
                .iter()
                .find(|user| user.id == user_id)
                .cloned())
        })
    }

    fn find_by_name<'a>(
        &'a self,
        name: &'a str,
    ) -> ServiceFuture<'a, AppResult<Option<LegacyUserRecord>>> {
        Box::pin(async move {
            Ok(self
                .users
                .lock()
                .map_err(|_| AppError::Internal)?
                .iter()
                .find(|user| user.name == name)
                .cloned())
        })
    }

    fn create<'a>(&'a self, input: UserCreateRequest) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut next_id = self.next_id.lock().map_err(|_| AppError::Internal)?;
            let role = role_for_id(input.role_id)?;
            let user_id = *next_id;
            let mut user = LegacyUserRecord::new(user_id, input.name, "placeholder", role);
            user.password_hash = input.password;
            user.create_at = "2026-07-01T00:00:00Z".to_owned();
            user.update_at = "2026-07-01T00:00:00Z".to_owned();
            self.users
                .lock()
                .map_err(|_| AppError::Internal)?
                .push(user);
            self.avatars
                .lock()
                .map_err(|_| AppError::Internal)?
                .push(AvatarInfo::default_for_user(user_id));
            *next_id += 1;
            Ok(())
        })
    }

    fn update<'a>(
        &'a self,
        user_id: i64,
        input: UserUpdateRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let role = role_for_id(input.role_id)?;
            let mut users = self.users.lock().map_err(|_| AppError::Internal)?;
            let user = users
                .iter_mut()
                .find(|user| user.id == user_id)
                .ok_or_else(|| AppError::NotFound(format!("user {user_id}")))?;
            user.name = input.name;
            user.role = role;
            user.update_at = "2026-07-01T00:00:00Z".to_owned();
            Ok(())
        })
    }

    fn update_password<'a>(
        &'a self,
        user_id: i64,
        password_hash: &'a str,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut users = self.users.lock().map_err(|_| AppError::Internal)?;
            let user = users
                .iter_mut()
                .find(|user| user.id == user_id)
                .ok_or_else(|| AppError::NotFound(format!("user {user_id}")))?;
            user.password_hash = password_hash.to_owned();
            user.update_at = "2026-07-01T00:00:00Z".to_owned();
            Ok(())
        })
    }

    fn remove<'a>(&'a self, user_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut users = self.users.lock().map_err(|_| AppError::Internal)?;
            let original_len = users.len();
            users.retain(|user| user.id != user_id);
            if users.len() == original_len {
                return Err(AppError::NotFound(format!("user {user_id}")));
            }
            self.avatars
                .lock()
                .map_err(|_| AppError::Internal)?
                .retain(|avatar| avatar.user_id != user_id);
            Ok(())
        })
    }

    fn avatar<'a>(&'a self, user_id: i64) -> ServiceFuture<'a, AppResult<Option<AvatarInfo>>> {
        Box::pin(async move {
            Ok(self
                .avatars
                .lock()
                .map_err(|_| AppError::Internal)?
                .iter()
                .find(|avatar| avatar.user_id == user_id)
                .cloned())
        })
    }

    fn update_avatar<'a>(
        &'a self,
        user_id: i64,
        input: AvatarUploadInput,
    ) -> ServiceFuture<'a, AppResult<AvatarInfo>> {
        Box::pin(async move {
            if self.find_by_id(user_id).await?.is_none() {
                return Err(AppError::NotFound(format!("user {user_id}")));
            }
            let avatar = AvatarInfo {
                filename: input.filename,
                mimetype: input.mimetype,
                size: input.size,
                user_id,
            };
            let mut avatars = self.avatars.lock().map_err(|_| AppError::Internal)?;
            if let Some(existing) = avatars
                .iter_mut()
                .find(|existing| existing.user_id == user_id)
            {
                *existing = avatar.clone();
            } else {
                avatars.push(avatar.clone());
            }
            Ok(avatar)
        })
    }
}

pub fn development_user_service() -> CompatUserService {
    CompatUserService::new(Arc::new(InMemoryUserStore::with_seed_data()))
}

fn normalize_new_user(input: &UserCreateRequest) -> AppResult<()> {
    if input.name.trim().is_empty() || input.password.is_empty() {
        return Err(AppError::Validation("用户名或密码不能为空！".to_owned()));
    }
    if input.role_id <= 0 {
        return Err(AppError::Validation("权限角色不能为空！".to_owned()));
    }
    Ok(())
}

fn role_for_id(role_id: i64) -> AppResult<UserRoleRecord> {
    match role_id {
        1 => Ok(UserRoleRecord::admin()),
        2 => Ok(UserRoleRecord::operator()),
        _ => Err(AppError::Validation("权限角色不存在".to_owned())),
    }
}

fn filter_users(users: &[LegacyUserRecord], input: &UserListRequest) -> Vec<LegacyUserRecord> {
    let name = input.name.as_deref().unwrap_or("").trim();
    users
        .iter()
        .filter(|user| name.is_empty() || user.name.contains(name))
        .filter(|user| input.enable.map_or(true, |enable| user.enable == enable))
        .filter(|user| {
            input
                .role_id
                .map_or(true, |role_id| user.role.id == role_id)
        })
        .filter(|user| {
            let Some(range) = &input.create_at else {
                return true;
            };
            let [start, end] = range.as_slice() else {
                return true;
            };
            let date = user
                .create_at
                .split('T')
                .next()
                .unwrap_or(user.create_at.as_str());
            date >= start.as_str() && date <= end.as_str()
        })
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use crate::{
        auth::legacy_md5_hex,
        dto::{UserCreateRequest, UserListRequest, UserPasswordRequest, UserUpdateRequest},
        services::{development_user_service, UserService},
    };

    #[tokio::test]
    async fn user_list_filters_by_name_enable_role_and_create_at() {
        let service = development_user_service();

        let response = service
            .list(UserListRequest {
                offset: 0,
                size: 10,
                name: Some("admin".to_owned()),
                enable: Some(1),
                role_id: Some(1),
                create_at: Some(vec!["2026-01-01".to_owned(), "2026-01-31".to_owned()]),
            })
            .await
            .expect("users should list");

        assert_eq!(response.total_count, 1);
        assert_eq!(response.list[0].id, 58);
        assert_eq!(response.list[0].role_id, 1);
        assert!(response.list[0].avatar_url.ends_with("/users/58/avatar"));
    }

    #[tokio::test]
    async fn user_detail_returns_legacy_role_object() {
        let service = development_user_service();

        let detail = service.detail(58).await.unwrap().unwrap();

        assert_eq!(detail.id, 58);
        assert_eq!(detail.role.id, 1);
        assert_eq!(detail.role.name, "超级管理员");
    }

    #[tokio::test]
    async fn user_create_update_password_and_remove_mutates_store() {
        let service = development_user_service();

        service
            .create(UserCreateRequest {
                name: "new_user".to_owned(),
                password: "secret2".to_owned(),
                role_id: 2,
            })
            .await
            .expect("user should create");
        let detail = service.detail(60).await.unwrap().unwrap();
        assert_eq!(detail.name, "new_user");
        assert_eq!(detail.role.id, 2);

        service
            .update(
                60,
                UserUpdateRequest {
                    name: "renamed".to_owned(),
                    role_id: 1,
                },
            )
            .await
            .expect("user should update");
        assert_eq!(service.detail(60).await.unwrap().unwrap().role.id, 1);

        service
            .update_password(60, UserPasswordRequest::Raw("new-secret".to_owned()))
            .await
            .expect("password should update");
        let avatar = service.avatar(60).await.unwrap().unwrap();
        assert_eq!(avatar.filename, "default.jpg");

        let updated_avatar = service
            .update_avatar(
                60,
                crate::dto::AvatarUploadInput {
                    filename: "1700000000000.jpg".to_owned(),
                    mimetype: "image/jpeg".to_owned(),
                    size: 128,
                },
            )
            .await
            .expect("avatar should update");
        assert_eq!(updated_avatar.filename, "1700000000000.jpg");
        assert_eq!(service.avatar(60).await.unwrap().unwrap().size, 128);

        service.remove(60).await.expect("user should delete");
        assert!(service.detail(60).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn user_create_rejects_duplicate_name() {
        let service = development_user_service();

        let error = service
            .create(UserCreateRequest {
                name: "admin".to_owned(),
                password: "secret".to_owned(),
                role_id: 1,
            })
            .await
            .expect_err("duplicate name should fail");

        assert_eq!(error.legacy_code(), -400);
        assert_eq!(error.to_string(), "请求参数错误: 用户已存在");
    }

    #[tokio::test]
    async fn protected_user_58_cannot_be_deleted() {
        let service = development_user_service();

        let error = service
            .remove(58)
            .await
            .expect_err("admin should be protected");

        assert_eq!(error.legacy_code(), -200);
        assert_eq!(error.to_string(), "删除用户失败！");
    }

    #[tokio::test]
    async fn user_password_request_supports_object_and_raw_password() {
        let service = development_user_service();

        service
            .update_password(
                59,
                UserPasswordRequest::Object {
                    password: "object-secret".to_owned(),
                },
            )
            .await
            .expect("object password should update");

        let store_password = legacy_md5_hex("object-secret".as_bytes());
        service
            .update_password(59, UserPasswordRequest::Raw("raw-secret".to_owned()))
            .await
            .expect("raw password should update");

        assert_ne!(store_password, legacy_md5_hex("raw-secret".as_bytes()));
    }
}

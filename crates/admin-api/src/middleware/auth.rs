use admin_core::{auth::is_super_admin, dto::CurrentUserResponse, AppError, AppResult};
use axum::http::{header::AUTHORIZATION, HeaderMap};

use crate::{response::ErrorResponse, AppState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthPolicy {
    Authenticated,
    Admin,
    SelfOrAdmin { user_id: i64 },
}

impl AuthPolicy {
    fn permits(self, user: &CurrentUserResponse) -> bool {
        match self {
            Self::Authenticated => true,
            Self::Admin => is_super_admin(&user.role_ids),
            Self::SelfOrAdmin { user_id } => user.id == user_id || is_super_admin(&user.role_ids),
        }
    }
}

pub fn require_bearer_token(auth_header: Option<&str>) -> AppResult<&str> {
    let header = auth_header.ok_or(AppError::Unauthorized)?;
    let token = header
        .strip_prefix("Bearer ")
        .filter(|token| !token.trim().is_empty())
        .ok_or(AppError::Unauthorized)?;

    Ok(token)
}

pub async fn require_auth(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<CurrentUserResponse, ErrorResponse> {
    let token = require_bearer_token(
        headers
            .get(AUTHORIZATION)
            .and_then(|value| value.to_str().ok()),
    )
    .map_err(ErrorResponse)?;

    state
        .auth_service
        .current_user(token)
        .await
        .map_err(ErrorResponse)
}

pub async fn require_policy(
    state: &AppState,
    headers: &HeaderMap,
    policy: AuthPolicy,
) -> Result<CurrentUserResponse, ErrorResponse> {
    let user = require_auth(state, headers).await?;
    if policy.permits(&user) {
        return Ok(user);
    }
    Err(ErrorResponse(AppError::Forbidden))
}

pub async fn require_admin(state: &AppState, headers: &HeaderMap) -> Result<(), ErrorResponse> {
    require_policy(state, headers, AuthPolicy::Admin)
        .await
        .map(|_| ())
}

pub async fn require_self_or_admin(
    state: &AppState,
    headers: &HeaderMap,
    user_id: i64,
) -> Result<(), ErrorResponse> {
    require_policy(state, headers, AuthPolicy::SelfOrAdmin { user_id })
        .await
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use admin_core::dto::CurrentUserResponse;

    use super::{require_bearer_token, AuthPolicy};

    fn current_user(id: i64, role_ids: Vec<i64>) -> CurrentUserResponse {
        CurrentUserResponse {
            id,
            name: format!("user-{id}"),
            roles: role_ids.iter().map(|role_id| role_id.to_string()).collect(),
            role_ids,
        }
    }

    #[test]
    fn bearer_token_is_extracted() {
        assert_eq!(require_bearer_token(Some("Bearer abc")).unwrap(), "abc");
    }

    #[test]
    fn missing_bearer_token_is_rejected() {
        assert!(require_bearer_token(Some("Basic abc")).is_err());
    }

    #[test]
    fn auth_policy_keeps_admin_and_self_boundaries_centralized() {
        let admin = current_user(58, vec![1]);
        let operator = current_user(59, vec![2]);

        assert!(AuthPolicy::Authenticated.permits(&operator));
        assert!(AuthPolicy::Admin.permits(&admin));
        assert!(!AuthPolicy::Admin.permits(&operator));
        assert!(AuthPolicy::SelfOrAdmin { user_id: 59 }.permits(&operator));
        assert!(AuthPolicy::SelfOrAdmin { user_id: 59 }.permits(&admin));
        assert!(!AuthPolicy::SelfOrAdmin { user_id: 58 }.permits(&operator));
    }
}

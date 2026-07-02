use admin_core::{auth::is_super_admin, dto::CurrentUserResponse, AppError, AppResult};
use axum::http::{header::AUTHORIZATION, HeaderMap};

use crate::{response::ErrorResponse, AppState};

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

pub async fn require_admin(state: &AppState, headers: &HeaderMap) -> Result<(), ErrorResponse> {
    let user = require_auth(state, headers).await?;
    if is_super_admin(&user.role_ids) {
        return Ok(());
    }
    Err(ErrorResponse(AppError::Forbidden))
}

pub async fn require_self_or_admin(
    state: &AppState,
    headers: &HeaderMap,
    user_id: i64,
) -> Result<(), ErrorResponse> {
    let user = require_auth(state, headers).await?;
    if user.id == user_id || is_super_admin(&user.role_ids) {
        return Ok(());
    }
    Err(ErrorResponse(AppError::Forbidden))
}

#[cfg(test)]
mod tests {
    use super::require_bearer_token;

    #[test]
    fn bearer_token_is_extracted() {
        assert_eq!(require_bearer_token(Some("Bearer abc")).unwrap(), "abc");
    }

    #[test]
    fn missing_bearer_token_is_rejected() {
        assert!(require_bearer_token(Some("Basic abc")).is_err());
    }
}

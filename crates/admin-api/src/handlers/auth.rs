use admin_core::dto::{LoginRequest, LoginResponse};
use axum::{
    extract::State,
    http::{header::AUTHORIZATION, HeaderMap},
    Json,
};

use crate::{
    middleware::auth::require_bearer_token,
    response::{ErrorResponse, JsonResponse},
    AppState,
};

pub async fn login(
    State(state): State<AppState>,
    Json(input): Json<LoginRequest>,
) -> Result<JsonResponse<LoginResponse>, ErrorResponse> {
    state
        .auth_service
        .login(input)
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<JsonResponse<admin_core::dto::CurrentUserResponse>, ErrorResponse> {
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
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

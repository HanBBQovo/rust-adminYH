use admin_core::dto::{LoginRequest, LoginResponse};
use axum::{extract::State, http::HeaderMap, Json};

use crate::{
    middleware::auth::require_auth,
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
    require_auth(&state, &headers).await.map(JsonResponse)
}

use admin_core::dto::{LoginRequest, LoginResponse};
use axum::{extract::State, Json};

use crate::{
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

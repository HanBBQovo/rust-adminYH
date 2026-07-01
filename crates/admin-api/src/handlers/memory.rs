use admin_core::dto::{CurrentUserResponse, MemoryRecord};
use axum::{
    extract::State,
    http::{header::AUTHORIZATION, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Serialize;

use crate::{middleware::auth::require_bearer_token, response::ErrorResponse, AppState};

#[derive(Serialize)]
pub struct LegacyMemoryResponse {
    data: Vec<MemoryRecord>,
}

impl IntoResponse for LegacyMemoryResponse {
    fn into_response(self) -> axum::response::Response {
        (StatusCode::OK, Json(self)).into_response()
    }
}

async fn require_auth(
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

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<LegacyMemoryResponse, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .memory_service
        .list()
        .await
        .map(|data| LegacyMemoryResponse { data })
        .map_err(ErrorResponse)
}

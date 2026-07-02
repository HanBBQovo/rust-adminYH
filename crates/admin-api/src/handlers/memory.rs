use admin_core::dto::MemoryRecord;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Serialize;

use crate::{middleware::auth::require_auth, response::ErrorResponse, AppState};

#[derive(Serialize)]
pub struct LegacyMemoryResponse {
    data: Vec<MemoryRecord>,
}

impl IntoResponse for LegacyMemoryResponse {
    fn into_response(self) -> axum::response::Response {
        (StatusCode::OK, Json(self)).into_response()
    }
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

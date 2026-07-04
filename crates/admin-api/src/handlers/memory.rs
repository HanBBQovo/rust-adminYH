use admin_core::dto::MemoryRecord;
use axum::{extract::State, http::HeaderMap};

use crate::{
    middleware::auth::require_auth,
    response::{ErrorResponse, LegacyDataResponse},
    AppState,
};

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<LegacyDataResponse<Vec<MemoryRecord>>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .memory_service
        .list()
        .await
        .map(LegacyDataResponse)
        .map_err(ErrorResponse)
}

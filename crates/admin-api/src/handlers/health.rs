use admin_core::dto::HealthResponse;
use axum::extract::State;

use crate::{response::JsonResponse, AppState};

pub async fn health_check(State(state): State<AppState>) -> JsonResponse<HealthResponse> {
    JsonResponse(HealthResponse::from(state.health_service.report()))
}

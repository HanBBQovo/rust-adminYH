use admin_core::{domain::ServiceStatus, dto::HealthResponse, ApiResponse};
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};

use crate::AppState;

pub async fn health_check(State(state): State<AppState>) -> impl IntoResponse {
    let report = state.health_service.report().await;
    let status = match report.status {
        ServiceStatus::Ok => StatusCode::OK,
        ServiceStatus::Degraded => StatusCode::SERVICE_UNAVAILABLE,
    };
    (status, Json(ApiResponse::ok(HealthResponse::from(report))))
}

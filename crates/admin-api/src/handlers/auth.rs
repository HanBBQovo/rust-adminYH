use admin_core::dto::{LoginRequest, LoginResponse};
use axum::{extract::State, http::HeaderMap, Json};
use serde::Serialize;
use uuid::Uuid;

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

#[derive(Debug, Serialize)]
pub struct CaptchaCodeResponse {
    pub data: String,
}

pub async fn code() -> Json<CaptchaCodeResponse> {
    Json(CaptchaCodeResponse {
        data: generate_svg_code(),
    })
}

pub async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<JsonResponse<admin_core::dto::CurrentUserResponse>, ErrorResponse> {
    require_auth(&state, &headers).await.map(JsonResponse)
}

fn generate_svg_code() -> String {
    let token = Uuid::new_v4().simple().to_string();
    let code = token[..4].to_ascii_uppercase();
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" viewBox="0 0 100 40"><rect width="100" height="40" fill="#87CEFA"/><line x1="5" y1="8" x2="92" y2="34" stroke="#2f5597" stroke-width="1" opacity="0.35"/><line x1="12" y1="32" x2="85" y2="6" stroke="#ffffff" stroke-width="1" opacity="0.55"/><text x="50" y="27" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#1f2937">{code}</text></svg>"##
    )
}

use admin_core::dto::{
    CurrentUserResponse, ReceiptListRequest, ReceiptListResponse, ReceiptStatusRequest,
};
use axum::{
    extract::{Path, State},
    http::{header::AUTHORIZATION, HeaderMap},
    Json,
};

use crate::{
    middleware::auth::require_bearer_token,
    response::{ErrorResponse, JsonResponse, MessageResponse},
    AppState,
};

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
    Json(input): Json<ReceiptListRequest>,
) -> Result<JsonResponse<ReceiptListResponse>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .receipt_service
        .list(input)
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn not_recovery(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ReceiptListRequest>,
) -> Result<JsonResponse<ReceiptListResponse>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .receipt_service
        .not_recovery(input)
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn recovery(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ReceiptListRequest>,
) -> Result<JsonResponse<ReceiptListResponse>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .receipt_service
        .recovery(input)
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn update_status(
    State(state): State<AppState>,
    Path(receipt_id): Path<i64>,
    headers: HeaderMap,
    Json(input): Json<ReceiptStatusRequest>,
) -> Result<MessageResponse, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .receipt_service
        .update_status(receipt_id, input)
        .await
        .map(|message| MessageResponse(message.to_owned()))
        .map_err(ErrorResponse)
}

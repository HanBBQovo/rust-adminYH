use admin_core::dto::{OrderListRequest, OrderListResponse, OrderMutationRequest};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};

use crate::{
    middleware::auth::{require_admin, require_auth},
    response::{ErrorResponse, JsonResponse, MessageResponse},
    AppState,
};

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<OrderListRequest>,
) -> Result<JsonResponse<OrderListResponse>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .order_service
        .list(input)
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn detail(
    State(state): State<AppState>,
    Path(order_id): Path<i64>,
    headers: HeaderMap,
) -> Result<JsonResponse<Option<admin_core::dto::LegacyOrderRecord>>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .order_service
        .detail(order_id)
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<OrderMutationRequest>,
) -> Result<MessageResponse, ErrorResponse> {
    require_admin(&state, &headers).await?;
    state
        .order_service
        .create(input)
        .await
        .map(|_| MessageResponse("创建订单成功！".to_owned()))
        .map_err(ErrorResponse)
}

pub async fn update(
    State(state): State<AppState>,
    Path(order_id): Path<i64>,
    headers: HeaderMap,
    Json(input): Json<OrderMutationRequest>,
) -> Result<MessageResponse, ErrorResponse> {
    require_admin(&state, &headers).await?;
    state
        .order_service
        .update(order_id, input)
        .await
        .map(|_| MessageResponse("修改订单信息成功！".to_owned()))
        .map_err(ErrorResponse)
}

pub async fn remove(
    State(state): State<AppState>,
    Path(order_id): Path<i64>,
    headers: HeaderMap,
) -> Result<MessageResponse, ErrorResponse> {
    require_admin(&state, &headers).await?;
    state
        .order_service
        .remove(order_id)
        .await
        .map(|_| MessageResponse("删除订单成功！".to_owned()))
        .map_err(ErrorResponse)
}

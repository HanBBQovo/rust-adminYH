use admin_core::dto::{
    ChartHeaderItem, CompanyOrderCountItem, CompanyOrderFreightItem, CompanyReceiptSumItem,
    CurrentUserResponse,
};
use axum::{
    extract::State,
    http::{header::AUTHORIZATION, HeaderMap},
};

use crate::{
    middleware::auth::require_bearer_token,
    response::{ErrorResponse, JsonResponse},
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

pub async fn header_list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<JsonResponse<Vec<ChartHeaderItem>>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .chart_service
        .header_list()
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn company_order_count(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<JsonResponse<Vec<CompanyOrderCountItem>>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .chart_service
        .company_order_count()
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn company_order_sumfreight(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<JsonResponse<Vec<CompanyOrderFreightItem>>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .chart_service
        .company_order_sumfreight()
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn company_receipt_sumreceipt(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<JsonResponse<Vec<CompanyReceiptSumItem>>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .chart_service
        .company_receipt_sumreceipt()
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

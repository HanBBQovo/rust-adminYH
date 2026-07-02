use admin_core::dto::{
    ChartHeaderItem, CompanyOrderCountItem, CompanyOrderFreightItem, CompanyReceiptSumItem,
};
use axum::{extract::State, http::HeaderMap};

use crate::{
    middleware::auth::require_auth,
    response::{ErrorResponse, JsonResponse},
    AppState,
};

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

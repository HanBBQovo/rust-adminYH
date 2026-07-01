use admin_core::dto::{LegacyMenuNode, RoleMenuIdsResponse};
use axum::{
    extract::{Path, State},
    http::{header::AUTHORIZATION, HeaderMap},
};

use crate::{
    middleware::auth::require_bearer_token,
    response::{ErrorResponse, JsonResponse},
    AppState,
};

async fn require_auth(state: &AppState, headers: &HeaderMap) -> Result<(), ErrorResponse> {
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
        .map(|_| ())
        .map_err(ErrorResponse)
}

pub async fn role_menu(
    State(state): State<AppState>,
    Path(role_id): Path<i64>,
    headers: HeaderMap,
) -> Result<JsonResponse<Vec<LegacyMenuNode>>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .menu_service
        .role_menu_tree(role_id)
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn menu_tree(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<JsonResponse<Vec<LegacyMenuNode>>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .menu_service
        .menu_tree()
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn role_menu_ids(
    State(state): State<AppState>,
    Path(role_id): Path<i64>,
    headers: HeaderMap,
) -> Result<JsonResponse<RoleMenuIdsResponse>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .menu_service
        .role_menu_ids(role_id)
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

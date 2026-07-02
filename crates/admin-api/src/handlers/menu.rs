use admin_core::{
    dto::{CurrentUserResponse, LegacyMenuNode, MenuMutationRequest, RoleMenuIdsResponse},
    AppError,
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

async fn require_admin(state: &AppState, headers: &HeaderMap) -> Result<(), ErrorResponse> {
    let user = require_auth(state, headers).await?;
    if user.role_ids.contains(&1) {
        return Ok(());
    }
    Err(ErrorResponse(AppError::Forbidden))
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

pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<MenuMutationRequest>,
) -> Result<MessageResponse, ErrorResponse> {
    require_admin(&state, &headers).await?;
    state
        .menu_service
        .create(input)
        .await
        .map(|_| MessageResponse("创建菜单成功！".to_owned()))
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

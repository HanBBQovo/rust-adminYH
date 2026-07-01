use admin_core::{
    dto::{
        CurrentUserResponse, RoleAssignRequest, RoleListRequest, RoleListResponse,
        RoleMutationRequest, RoleRecord,
    },
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

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<RoleListRequest>,
) -> Result<JsonResponse<RoleListResponse>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .role_service
        .list(input)
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn detail(
    State(state): State<AppState>,
    Path(role_id): Path<i64>,
    headers: HeaderMap,
) -> Result<JsonResponse<Option<RoleRecord>>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .role_service
        .detail(role_id)
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<RoleMutationRequest>,
) -> Result<MessageResponse, ErrorResponse> {
    require_admin(&state, &headers).await?;
    state
        .role_service
        .create(input)
        .await
        .map(|_| MessageResponse("创建权限角色成功！".to_owned()))
        .map_err(ErrorResponse)
}

pub async fn update(
    State(state): State<AppState>,
    Path(role_id): Path<i64>,
    headers: HeaderMap,
    Json(input): Json<RoleMutationRequest>,
) -> Result<MessageResponse, ErrorResponse> {
    require_admin(&state, &headers).await?;
    state
        .role_service
        .update(role_id, input)
        .await
        .map(|_| MessageResponse("修改角色信息成功!".to_owned()))
        .map_err(ErrorResponse)
}

pub async fn remove(
    State(state): State<AppState>,
    Path(role_id): Path<i64>,
    headers: HeaderMap,
) -> Result<MessageResponse, ErrorResponse> {
    require_admin(&state, &headers).await?;
    state
        .role_service
        .remove(role_id)
        .await
        .map(|_| MessageResponse("删除权限角色成功！".to_owned()))
        .map_err(ErrorResponse)
}

pub async fn assign(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<RoleAssignRequest>,
) -> Result<MessageResponse, ErrorResponse> {
    require_admin(&state, &headers).await?;
    state
        .role_service
        .assign(input)
        .await
        .map(|_| MessageResponse("分配权限成功！".to_owned()))
        .map_err(ErrorResponse)
}

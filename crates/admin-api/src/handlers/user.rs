use admin_core::{
    dto::{
        CurrentUserResponse, UserCreateRequest, UserDetailResponse, UserListRequest,
        UserListResponse, UserPasswordRequest, UserUpdateRequest,
    },
    AppError,
};
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header::AUTHORIZATION, HeaderMap, StatusCode},
    response::IntoResponse,
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

async fn require_self_or_admin(
    state: &AppState,
    headers: &HeaderMap,
    user_id: i64,
) -> Result<(), ErrorResponse> {
    let user = require_auth(state, headers).await?;
    if user.id == user_id || user.role_ids.contains(&1) {
        return Ok(());
    }
    Err(ErrorResponse(AppError::Forbidden))
}

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<UserListRequest>,
) -> Result<JsonResponse<UserListResponse>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .user_service
        .list(input)
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn detail(
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
    headers: HeaderMap,
) -> Result<JsonResponse<Option<UserDetailResponse>>, ErrorResponse> {
    require_auth(&state, &headers).await?;
    state
        .user_service
        .detail(user_id)
        .await
        .map(JsonResponse)
        .map_err(ErrorResponse)
}

pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<UserCreateRequest>,
) -> Result<MessageResponse, ErrorResponse> {
    require_admin(&state, &headers).await?;
    state
        .user_service
        .create(input)
        .await
        .map(|_| MessageResponse("创建用户成功！".to_owned()))
        .map_err(ErrorResponse)
}

pub async fn update(
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
    headers: HeaderMap,
    Json(input): Json<UserUpdateRequest>,
) -> Result<MessageResponse, ErrorResponse> {
    require_admin(&state, &headers).await?;
    state
        .user_service
        .update(user_id, input)
        .await
        .map(|_| MessageResponse("修改用户信息成功!".to_owned()))
        .map_err(ErrorResponse)
}

pub async fn update_password(
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
    headers: HeaderMap,
    Json(input): Json<UserPasswordRequest>,
) -> Result<MessageResponse, ErrorResponse> {
    require_self_or_admin(&state, &headers, user_id).await?;
    state
        .user_service
        .update_password(user_id, input)
        .await
        .map(|_| MessageResponse("修改密码成功！".to_owned()))
        .map_err(ErrorResponse)
}

pub async fn remove(
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
    headers: HeaderMap,
) -> Result<MessageResponse, ErrorResponse> {
    require_admin(&state, &headers).await?;
    state
        .user_service
        .remove(user_id)
        .await
        .map(|_| MessageResponse("删除用户成功！".to_owned()))
        .map_err(ErrorResponse)
}

pub async fn avatar(
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
) -> axum::response::Response {
    match state.user_service.avatar(user_id).await {
        Ok(Some(avatar)) => (
            StatusCode::OK,
            [("content-type", avatar.mimetype)],
            Body::from(format!("avatar:{}", avatar.filename)),
        )
            .into_response(),
        Ok(None) => ErrorResponse(AppError::NotFound(format!("avatar {user_id}"))).into_response(),
        Err(error) => ErrorResponse(error).into_response(),
    }
}

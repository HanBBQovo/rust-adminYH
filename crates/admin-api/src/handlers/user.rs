use admin_core::{
    dto::{
        AvatarInfo, AvatarUploadInput, UserCreateRequest, UserDetailResponse, UserListRequest,
        UserListResponse, UserPasswordRequest, UserUpdateRequest,
    },
    AppError,
};
use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use std::{
    path::{Path as FsPath, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{
    middleware::auth::{require_admin, require_auth, require_self_or_admin},
    response::{ErrorResponse, JsonResponse, MessageResponse},
    AppState,
};

const MAX_AVATAR_SIZE: usize = 500 * 1024;
const ALLOWED_AVATAR_MIME_TYPES: &[&str] = &["image/jpeg", "image/png"];
const ALLOWED_AVATAR_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png"];

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
        Ok(Some(avatar)) => avatar_response(&state, avatar).await,
        Ok(None) => ErrorResponse(AppError::NotFound(format!("avatar {user_id}"))).into_response(),
        Err(error) => ErrorResponse(error).into_response(),
    }
}

pub async fn upload_avatar(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<MessageResponse, ErrorResponse> {
    let user = require_auth(&state, &headers).await?;
    let upload = read_avatar_upload(&mut multipart)
        .await
        .map_err(ErrorResponse)?;
    let avatar_dir = PathBuf::from(&state.config.storage.avatar_dir);
    let previous_avatar = state
        .user_service
        .avatar(user.id)
        .await
        .map_err(ErrorResponse)?;
    let path = persist_avatar_file(&avatar_dir, &upload.filename, &upload.bytes)
        .await
        .map_err(ErrorResponse)?;

    if let Err(error) = state
        .user_service
        .update_avatar(
            user.id,
            AvatarUploadInput {
                filename: upload.filename.clone(),
                mimetype: upload.mimetype,
                size: upload.bytes.len(),
            },
        )
        .await
    {
        let _ = tokio::fs::remove_file(path).await;
        return Err(ErrorResponse(error));
    }

    remove_previous_avatar(&avatar_dir, previous_avatar).await;
    Ok(MessageResponse("上传头像成功！".to_owned()))
}

struct PendingAvatarUpload {
    filename: String,
    mimetype: String,
    bytes: Vec<u8>,
}

async fn read_avatar_upload(
    multipart: &mut Multipart,
) -> admin_core::AppResult<PendingAvatarUpload> {
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|err| AppError::Validation(format!("头像上传失败: {err}")))?
    {
        if field.name() != Some("avatar") {
            continue;
        }
        let mimetype = field
            .content_type()
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| "application/octet-stream".to_owned());
        let extension = avatar_extension(field.file_name())?;
        let bytes = field
            .bytes()
            .await
            .map_err(|err| AppError::Validation(format!("头像上传失败: {err}")))?
            .to_vec();
        if bytes.is_empty() {
            return Err(AppError::Validation("头像文件不能为空".to_owned()));
        }
        if bytes.len() > MAX_AVATAR_SIZE {
            return Err(AppError::Validation("头像不能超过 500kb！".to_owned()));
        }
        if !ALLOWED_AVATAR_MIME_TYPES.contains(&mimetype.as_str()) {
            return Err(AppError::Validation("只能上传 jpg/png 文件！".to_owned()));
        }
        return Ok(PendingAvatarUpload {
            filename: format!("{}.{}", epoch_millis(), extension),
            mimetype,
            bytes,
        });
    }
    Err(AppError::Validation("缺少头像文件".to_owned()))
}

fn avatar_extension(filename: Option<&str>) -> admin_core::AppResult<String> {
    let extension = filename
        .and_then(|filename| FsPath::new(filename).extension())
        .and_then(|extension| extension.to_str())
        .filter(|extension| !extension.trim().is_empty())
        .map(|extension| extension.to_ascii_lowercase())
        .ok_or_else(|| AppError::Validation("只能上传 jpg/png 文件！".to_owned()))?;

    if !ALLOWED_AVATAR_EXTENSIONS.contains(&extension.as_str()) {
        return Err(AppError::Validation("只能上传 jpg/png 文件！".to_owned()));
    }

    Ok(extension)
}

fn epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

async fn persist_avatar_file(
    avatar_dir: &FsPath,
    filename: &str,
    bytes: &[u8],
) -> admin_core::AppResult<PathBuf> {
    tokio::fs::create_dir_all(avatar_dir)
        .await
        .map_err(|err| AppError::Database(format!("创建头像目录失败: {err}")))?;
    let path = avatar_dir.join(filename);
    tokio::fs::write(&path, bytes)
        .await
        .map_err(|err| AppError::Database(format!("保存头像失败: {err}")))?;
    Ok(path)
}

async fn remove_previous_avatar(avatar_dir: &FsPath, avatar: Option<AvatarInfo>) {
    let Some(avatar) = avatar else {
        return;
    };
    if avatar.filename == "default.jpg" {
        return;
    }
    let _ = tokio::fs::remove_file(avatar_dir.join(avatar.filename)).await;
}

async fn avatar_response(state: &AppState, avatar: AvatarInfo) -> axum::response::Response {
    let path = PathBuf::from(&state.config.storage.avatar_dir).join(&avatar.filename);
    let bytes = match tokio::fs::read(&path).await {
        Ok(bytes) => bytes,
        Err(_) if avatar.filename != "default.jpg" => {
            let fallback = PathBuf::from(&state.config.storage.avatar_dir).join("default.jpg");
            tokio::fs::read(fallback)
                .await
                .unwrap_or_else(|_| format!("avatar:{}", avatar.filename).into_bytes())
        }
        Err(_) => format!("avatar:{}", avatar.filename).into_bytes(),
    };
    (
        StatusCode::OK,
        [("content-type", avatar.mimetype)],
        Body::from(bytes),
    )
        .into_response()
}

use serde::{Deserialize, Serialize};

use crate::auth::legacy_md5_hex;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct UserCreateRequest {
    pub name: String,
    pub password: String,
    #[serde(rename = "roleId")]
    pub role_id: i64,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct UserUpdateRequest {
    pub name: String,
    #[serde(rename = "roleId")]
    pub role_id: i64,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum UserPasswordRequest {
    Object { password: String },
    Raw(String),
}

impl UserPasswordRequest {
    pub fn password(&self) -> &str {
        match self {
            Self::Object { password } => password,
            Self::Raw(password) => password,
        }
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct UserListRequest {
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_page_size")]
    pub size: usize,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub enable: Option<i32>,
    #[serde(rename = "roleId", default)]
    pub role_id: Option<i64>,
    #[serde(rename = "createAt", default)]
    pub create_at: Option<Vec<String>>,
}

fn default_page_size() -> usize {
    10
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LegacyUserRecord {
    pub id: i64,
    pub name: String,
    pub password_hash: String,
    pub avatar_url: String,
    pub enable: i32,
    pub role: LegacyRoleRecord,
    pub create_at: String,
    pub update_at: String,
}

impl LegacyUserRecord {
    pub fn new(id: i64, name: impl Into<String>, password: &str, role: LegacyRoleRecord) -> Self {
        Self {
            id,
            name: name.into(),
            password_hash: legacy_md5_hex(password.as_bytes()),
            avatar_url: format!("http://127.0.0.1:8000/users/{id}/avatar"),
            enable: 1,
            role,
            create_at: "2026-01-01T00:00:00Z".to_owned(),
            update_at: "2026-01-02T00:00:00Z".to_owned(),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LegacyRoleRecord {
    pub id: i64,
    pub name: String,
    pub intro: String,
    #[serde(rename = "createAt")]
    pub create_at: String,
    #[serde(rename = "updateAt")]
    pub update_at: String,
}

impl LegacyRoleRecord {
    pub fn admin() -> Self {
        Self {
            id: 1,
            name: "超级管理员".to_owned(),
            intro: "系统内置管理员".to_owned(),
            create_at: "2026-01-01T00:00:00Z".to_owned(),
            update_at: "2026-01-01T00:00:00Z".to_owned(),
        }
    }

    pub fn operator() -> Self {
        Self {
            id: 2,
            name: "普通用户".to_owned(),
            intro: "普通业务用户".to_owned(),
            create_at: "2026-01-01T00:00:00Z".to_owned(),
            update_at: "2026-01-01T00:00:00Z".to_owned(),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct UserListItemResponse {
    pub id: i64,
    pub name: String,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: String,
    pub enable: i32,
    #[serde(rename = "roleId")]
    pub role_id: i64,
    #[serde(rename = "createAt")]
    pub create_at: String,
    #[serde(rename = "updateAt")]
    pub update_at: String,
}

impl From<LegacyUserRecord> for UserListItemResponse {
    fn from(value: LegacyUserRecord) -> Self {
        Self {
            id: value.id,
            name: value.name,
            avatar_url: value.avatar_url,
            enable: value.enable,
            role_id: value.role.id,
            create_at: value.create_at,
            update_at: value.update_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct UserDetailResponse {
    pub id: i64,
    pub name: String,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: String,
    pub enable: i32,
    #[serde(rename = "createAt")]
    pub create_at: String,
    #[serde(rename = "updateAt")]
    pub update_at: String,
    pub role: LegacyRoleRecord,
}

impl From<LegacyUserRecord> for UserDetailResponse {
    fn from(value: LegacyUserRecord) -> Self {
        Self {
            id: value.id,
            name: value.name,
            avatar_url: value.avatar_url,
            enable: value.enable,
            create_at: value.create_at,
            update_at: value.update_at,
            role: value.role,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct UserListResponse {
    pub list: Vec<UserListItemResponse>,
    #[serde(rename = "totalCount")]
    pub total_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AvatarInfo {
    pub filename: String,
    pub mimetype: String,
    pub size: usize,
    pub user_id: i64,
}

impl AvatarInfo {
    pub fn default_for_user(user_id: i64) -> Self {
        Self {
            filename: "default.jpg".to_owned(),
            mimetype: "image/jpeg".to_owned(),
            size: 37_622,
            user_id,
        }
    }
}

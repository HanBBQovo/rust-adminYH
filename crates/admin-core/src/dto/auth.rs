use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct LoginRequest {
    pub name: String,
    pub password: String,
    #[serde(default)]
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LoginResponse {
    pub id: i64,
    pub name: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CurrentUserResponse {
    pub id: i64,
    pub name: String,
    pub roles: Vec<String>,
    #[serde(rename = "roleIds")]
    pub role_ids: Vec<i64>,
}

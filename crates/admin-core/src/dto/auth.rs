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

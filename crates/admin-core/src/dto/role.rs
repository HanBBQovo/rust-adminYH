use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct RoleMutationRequest {
    pub name: String,
    pub intro: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct RoleListRequest {
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_page_size")]
    pub size: usize,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub intro: Option<String>,
    #[serde(rename = "createAt", default)]
    pub create_at: Option<Vec<String>>,
}

fn default_page_size() -> usize {
    10
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct RoleAssignRequest {
    #[serde(rename = "roleId")]
    pub role_id: i64,
    #[serde(rename = "menuList")]
    pub menu_list: Vec<i64>,
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
    pub fn new(
        id: i64,
        name: impl Into<String>,
        intro: impl Into<String>,
        create_at: impl Into<String>,
        update_at: impl Into<String>,
    ) -> Self {
        Self {
            id,
            name: name.into(),
            intro: intro.into(),
            create_at: create_at.into(),
            update_at: update_at.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct RoleListResponse {
    pub list: Vec<LegacyRoleRecord>,
    #[serde(rename = "totalCount")]
    pub total_count: usize,
}

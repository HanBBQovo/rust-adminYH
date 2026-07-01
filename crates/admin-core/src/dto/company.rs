use serde::{Deserialize, Serialize};

use crate::domain::Company;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct CompanyListRequest {
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_page_size")]
    pub size: usize,
}

fn default_page_size() -> usize {
    10
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct CompanyMutationRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LegacyCompanyRecord {
    pub id: i64,
    pub name: String,
    #[serde(rename = "createAt")]
    pub create_at: String,
    #[serde(rename = "updateAt")]
    pub update_at: String,
    #[serde(rename = "Countorder")]
    pub count_order: i64,
}

impl From<Company> for LegacyCompanyRecord {
    fn from(value: Company) -> Self {
        Self {
            id: value.id,
            name: value.name,
            create_at: value.create_at,
            update_at: value.update_at,
            count_order: value.order_count,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CompanyListResponse {
    pub list: Vec<LegacyCompanyRecord>,
    #[serde(rename = "totalCount")]
    pub total_count: usize,
}

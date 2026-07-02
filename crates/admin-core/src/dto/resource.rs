use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ResourceSummary {
    pub key: String,
    pub title: String,
    pub description: String,
    pub count: usize,
    pub status: String,
    #[serde(rename = "apiPath")]
    pub api_path: String,
    #[serde(rename = "legacyPath")]
    pub legacy_path: String,
    pub owner: String,
}

impl ResourceSummary {
    pub fn ready(
        key: impl Into<String>,
        title: impl Into<String>,
        description: impl Into<String>,
        count: usize,
        api_path: impl Into<String>,
        legacy_path: impl Into<String>,
        owner: impl Into<String>,
    ) -> Self {
        Self {
            key: key.into(),
            title: title.into(),
            description: description.into(),
            count,
            status: "ready".to_owned(),
            api_path: api_path.into(),
            legacy_path: legacy_path.into(),
            owner: owner.into(),
        }
    }
}

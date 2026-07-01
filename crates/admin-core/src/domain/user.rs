use crate::auth::{legacy_md5_hex, PasswordHash};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthUser {
    pub id: i64,
    pub name: String,
    pub password_hash: PasswordHash,
    pub role_ids: Vec<i64>,
}

impl AuthUser {
    pub fn new(id: i64, name: impl Into<String>, password_hash: PasswordHash) -> Self {
        Self {
            id,
            name: name.into(),
            password_hash,
            role_ids: Vec::new(),
        }
    }

    pub fn with_legacy_md5_password(id: i64, name: impl Into<String>, password: &str) -> Self {
        Self::new(
            id,
            name,
            PasswordHash::new(legacy_md5_hex(password.as_bytes())),
        )
    }

    pub fn with_role_ids(mut self, role_ids: impl IntoIterator<Item = i64>) -> Self {
        self.role_ids = role_ids.into_iter().collect();
        self
    }
}

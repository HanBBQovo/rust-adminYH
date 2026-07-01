use crate::auth::{legacy_md5_hex, PasswordHash};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthUser {
    pub id: i64,
    pub name: String,
    pub password_hash: PasswordHash,
}

impl AuthUser {
    pub fn new(id: i64, name: impl Into<String>, password_hash: PasswordHash) -> Self {
        Self {
            id,
            name: name.into(),
            password_hash,
        }
    }

    pub fn with_legacy_md5_password(id: i64, name: impl Into<String>, password: &str) -> Self {
        Self::new(
            id,
            name,
            PasswordHash::new(legacy_md5_hex(password.as_bytes())),
        )
    }
}

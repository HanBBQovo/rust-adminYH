#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PasswordHash(String);

impl PasswordHash {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn is_legacy_md5(&self) -> bool {
        self.0.len() == 32 && self.0.chars().all(|ch| ch.is_ascii_hexdigit())
    }
}

pub trait PasswordVerifier: Send + Sync {
    fn verify(&self, password: &str, hash: &PasswordHash) -> bool;
}

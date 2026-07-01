use admin_core::{AppError, AppResult};

pub fn require_bearer_token(auth_header: Option<&str>) -> AppResult<&str> {
    let header = auth_header.ok_or(AppError::Unauthorized)?;
    let token = header
        .strip_prefix("Bearer ")
        .filter(|token| !token.trim().is_empty())
        .ok_or(AppError::Unauthorized)?;

    Ok(token)
}

#[cfg(test)]
mod tests {
    use super::require_bearer_token;

    #[test]
    fn bearer_token_is_extracted() {
        assert_eq!(require_bearer_token(Some("Bearer abc")).unwrap(), "abc");
    }

    #[test]
    fn missing_bearer_token_is_rejected() {
        assert!(require_bearer_token(Some("Basic abc")).is_err());
    }
}

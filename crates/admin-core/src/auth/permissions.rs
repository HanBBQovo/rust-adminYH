#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionAction {
    Create,
    Read,
    Update,
    Delete,
    Export,
}

pub const SUPER_ADMIN_ROLE_ID: i64 = 1;

pub fn is_super_admin(role_ids: &[i64]) -> bool {
    role_ids.contains(&SUPER_ADMIN_ROLE_ID)
}

pub trait PermissionChecker: Send + Sync {
    fn can(&self, subject: &str, action: PermissionAction) -> bool;
}

#[cfg(test)]
mod tests {
    use super::is_super_admin;

    #[test]
    fn super_admin_role_is_centralized() {
        assert!(is_super_admin(&[1]));
        assert!(is_super_admin(&[2, 1]));
        assert!(!is_super_admin(&[2]));
        assert!(!is_super_admin(&[]));
    }
}

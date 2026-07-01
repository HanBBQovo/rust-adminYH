#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionAction {
    Create,
    Read,
    Update,
    Delete,
    Export,
}

pub trait PermissionChecker: Send + Sync {
    fn can(&self, subject: &str, action: PermissionAction) -> bool;
}

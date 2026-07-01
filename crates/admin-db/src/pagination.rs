use admin_core::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Page {
    pub offset: u64,
    pub limit: u64,
}

impl Page {
    pub const DEFAULT_SIZE: u64 = 20;
    pub const MAX_SIZE: u64 = 200;

    pub fn new(current: u64, size: u64) -> AppResult<Self> {
        if current == 0 {
            return Err(AppError::Validation("页码必须从 1 开始".to_owned()));
        }

        let limit = size.clamp(1, Self::MAX_SIZE);
        let offset = (current - 1) * limit;

        Ok(Self { offset, limit })
    }
}

impl Default for Page {
    fn default() -> Self {
        Self {
            offset: 0,
            limit: Self::DEFAULT_SIZE,
        }
    }
}

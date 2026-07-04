use admin_core::{AppError, AppResult};
use sqlx::{MySql, QueryBuilder};

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

    pub fn from_offset_size(offset: usize, size: usize) -> Self {
        Self {
            offset: offset as u64,
            limit: (size as u64).clamp(1, Self::MAX_SIZE),
        }
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

pub fn push_limit_offset(query: &mut QueryBuilder<'_, MySql>, page: Page) -> AppResult<()> {
    let limit = i64::try_from(page.limit)
        .map_err(|_| AppError::Validation("分页大小超出数据库绑定范围".to_owned()))?;
    let offset = i64::try_from(page.offset)
        .map_err(|_| AppError::Validation("分页偏移超出数据库绑定范围".to_owned()))?;

    query.push(" LIMIT ");
    query.push_bind(limit);
    query.push(" OFFSET ");
    query.push_bind(offset);

    Ok(())
}

#[cfg(test)]
mod tests {
    use sqlx::{Execute, MySql, QueryBuilder};

    use super::{push_limit_offset, Page};

    #[test]
    fn page_new_rejects_zero_page() {
        let error = Page::new(0, 10).unwrap_err();

        assert!(error.to_string().contains("页码必须从 1 开始"));
    }

    #[test]
    fn page_new_clamps_size_and_calculates_offset() {
        assert_eq!(
            Page::new(3, Page::MAX_SIZE + 50).unwrap(),
            Page {
                offset: Page::MAX_SIZE * 2,
                limit: Page::MAX_SIZE
            },
        );
    }

    #[test]
    fn page_from_offset_size_keeps_legacy_offset_and_clamps_size() {
        assert_eq!(
            Page::from_offset_size(40, 0),
            Page {
                offset: 40,
                limit: 1
            },
        );
        assert_eq!(
            Page::from_offset_size(40, Page::MAX_SIZE as usize + 1),
            Page {
                offset: 40,
                limit: Page::MAX_SIZE
            },
        );
    }

    #[test]
    fn default_page_uses_first_default_size_page() {
        assert_eq!(
            Page::default(),
            Page {
                offset: 0,
                limit: Page::DEFAULT_SIZE
            },
        );
    }

    #[test]
    fn push_limit_offset_appends_bound_mysql_pagination_clause() {
        let mut query = QueryBuilder::<MySql>::new("SELECT * FROM `user` ORDER BY `id` ASC");

        push_limit_offset(
            &mut query,
            Page {
                offset: 20,
                limit: 10,
            },
        )
        .unwrap();

        assert_eq!(
            query.build().sql(),
            "SELECT * FROM `user` ORDER BY `id` ASC LIMIT ? OFFSET ?",
        );
    }
}

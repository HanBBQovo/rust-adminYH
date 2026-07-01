use admin_core::{AppError, AppResult};

use crate::pool::MySqlPool;

pub async fn run(pool: &MySqlPool) -> AppResult<()> {
    if !pool.is_configured() {
        return Err(AppError::Database(
            "数据库连接池尚未初始化，等待旧库 schema 导出后启用迁移".to_owned(),
        ));
    }

    Ok(())
}

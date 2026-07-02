use admin_core::AppResult;

use crate::pool::MySqlPool;

pub async fn run(pool: &MySqlPool) -> AppResult<()> {
    sqlx::migrate!("./src/migrations")
        .run(pool)
        .await
        .map_err(|error| admin_core::AppError::Database(format!("数据库迁移失败: {error}")))?;
    Ok(())
}

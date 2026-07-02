use admin_core::{
    domain::HealthCheck,
    services::{health::ServiceFuture, HealthCheckService},
    AppError, AppResult,
};
use sqlx::MySqlPool;

pub trait HealthRepository: Send + Sync {
    fn ping(&self) -> impl std::future::Future<Output = AppResult<()>> + Send;
}

#[derive(Debug, Clone)]
pub struct MySqlHealthRepository {
    pool: MySqlPool,
}

impl MySqlHealthRepository {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }
}

impl HealthRepository for MySqlHealthRepository {
    async fn ping(&self) -> AppResult<()> {
        sqlx::query("SELECT 1")
            .execute(&self.pool)
            .await
            .map_err(db_error)?;
        Ok(())
    }
}

impl HealthCheckService for MySqlHealthRepository {
    fn check<'a>(&'a self) -> ServiceFuture<'a, HealthCheck> {
        Box::pin(async move {
            match self.ping().await {
                Ok(()) => HealthCheck::ok("database"),
                Err(error) => HealthCheck::degraded("database", error.to_string()),
            }
        })
    }
}

fn db_error(err: sqlx::Error) -> AppError {
    AppError::Database(err.to_string())
}

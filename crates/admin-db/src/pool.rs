use std::time::Duration;

use admin_core::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::mysql::MySqlPoolOptions;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub connect_timeout_seconds: u64,
    pub migrate_on_start: bool,
}

impl DatabaseConfig {
    pub fn validate(&self) -> AppResult<()> {
        if self.url.trim().is_empty() {
            return Err(AppError::Config("DATABASE_URL 不能为空".to_owned()));
        }

        if self.max_connections == 0 {
            return Err(AppError::Config(
                "DATABASE_MAX_CONNECTIONS 必须大于 0".to_owned(),
            ));
        }

        if self.min_connections > self.max_connections {
            return Err(AppError::Config(
                "DATABASE_MIN_CONNECTIONS 不能大于 DATABASE_MAX_CONNECTIONS".to_owned(),
            ));
        }

        Ok(())
    }
}

pub type MySqlPool = sqlx::MySqlPool;

pub async fn build_mysql_pool(config: &DatabaseConfig) -> AppResult<MySqlPool> {
    config.validate()?;

    MySqlPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .acquire_timeout(Duration::from_secs(config.connect_timeout_seconds))
        .connect(&config.url)
        .await
        .map_err(|error| AppError::Database(format!("数据库连接失败: {error}")))
}

#[cfg(test)]
mod tests {
    use super::DatabaseConfig;

    #[test]
    fn database_config_rejects_empty_url() {
        let config = DatabaseConfig {
            url: String::new(),
            max_connections: 10,
            min_connections: 1,
            connect_timeout_seconds: 5,
            migrate_on_start: false,
        };

        assert!(config.validate().is_err());
    }
}

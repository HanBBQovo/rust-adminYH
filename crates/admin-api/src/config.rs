use std::net::IpAddr;

use admin_core::{AppError, AppResult};
use admin_db::DatabaseConfig;
use std::{env, str::FromStr};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppConfig {
    pub env: String,
    pub name: String,
    pub http: HttpConfig,
    pub logging: LoggingConfig,
    pub database: DatabaseConfig,
    pub storage: StorageConfig,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpConfig {
    pub host: IpAddr,
    pub port: u16,
    pub request_id_header: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoggingConfig {
    pub level: String,
    pub json_logs: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageConfig {
    pub avatar_dir: String,
}

impl AppConfig {
    pub fn from_env() -> AppResult<Self> {
        dotenvy::dotenv().ok();

        Ok(Self {
            env: env_or("APP_ENV", "local"),
            name: env_or("APP_NAME", "rust-adminYH"),
            http: HttpConfig {
                host: parse_env("APP_HTTP__HOST", "127.0.0.1")?,
                port: parse_env("APP_HTTP__PORT", "18080")?,
                request_id_header: env_or("APP_HTTP__REQUEST_ID_HEADER", "x-request-id"),
            },
            logging: LoggingConfig {
                level: env_or("APP_LOGGING__LEVEL", "info"),
                json_logs: parse_env("APP_LOGGING__JSON_LOGS", "false")?,
            },
            database: DatabaseConfig {
                url: env_or(
                    "DATABASE_URL",
                    "mysql://admin_yh:admin_yh@127.0.0.1:3306/admin_yh",
                ),
                max_connections: parse_env("DATABASE_MAX_CONNECTIONS", "10")?,
                min_connections: parse_env("DATABASE_MIN_CONNECTIONS", "1")?,
                connect_timeout_seconds: parse_env("DATABASE_CONNECT_TIMEOUT_SECONDS", "5")?,
            },
            storage: StorageConfig {
                avatar_dir: env_or(
                    "APP_STORAGE__AVATAR_DIR",
                    "../adminYh-server/uploads/avatar",
                ),
            },
        })
    }
}

fn env_or(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_owned())
}

fn parse_env<T>(key: &str, default: &str) -> AppResult<T>
where
    T: FromStr,
    T::Err: std::fmt::Display,
{
    env_or(key, default)
        .parse::<T>()
        .map_err(|err| AppError::Config(format!("{key} 配置无效: {err}")))
}

#[cfg(test)]
mod tests {
    use super::AppConfig;

    #[test]
    fn default_config_loads() {
        let config = AppConfig::from_env().expect("default config should load");

        assert_eq!(config.name, "rust-adminYH");
        assert!(config.database.max_connections > 0);
    }
}

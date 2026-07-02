use admin_core::{AppError, AppResult};
use admin_db::DatabaseConfig;
use std::{env, net::IpAddr, str::FromStr};

pub const DEFAULT_HTTP_PORT: u16 = 16824;

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
    pub cors_origins: CorsOrigins,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CorsOrigins {
    Any,
    List(Vec<String>),
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
        let app_env = env_or("APP_ENV", "local");
        let cors_origins = parse_cors_origins(&app_env, env::var("APP_HTTP__CORS_ORIGINS").ok())?;

        Ok(Self {
            env: app_env,
            name: env_or("APP_NAME", "rust-adminYH"),
            http: HttpConfig {
                host: parse_env("APP_HTTP__HOST", "127.0.0.1")?,
                port: parse_env("APP_HTTP__PORT", "16824")?,
                request_id_header: env_or("APP_HTTP__REQUEST_ID_HEADER", "x-request-id"),
                cors_origins,
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
                migrate_on_start: parse_env("DATABASE_MIGRATE_ON_START", "false")?,
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

fn parse_cors_origins(app_env: &str, raw_value: Option<String>) -> AppResult<CorsOrigins> {
    let value = raw_value.unwrap_or_default();
    let origins = value
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .collect::<Vec<_>>();
    let is_production = app_env.eq_ignore_ascii_case("production");

    if origins.is_empty() {
        return if is_production {
            Err(AppError::Config(
                "APP_HTTP__CORS_ORIGINS 在 production 必须显式配置，不能使用通配 CORS".to_owned(),
            ))
        } else {
            Ok(CorsOrigins::Any)
        };
    }

    if origins.contains(&"*") {
        return if is_production {
            Err(AppError::Config(
                "APP_HTTP__CORS_ORIGINS 在 production 不能包含 *".to_owned(),
            ))
        } else {
            Ok(CorsOrigins::Any)
        };
    }

    let parsed = origins
        .into_iter()
        .map(|origin| {
            origin
                .parse::<http::HeaderValue>()
                .map(|_| origin.to_owned())
                .map_err(|err| AppError::Config(format!("APP_HTTP__CORS_ORIGINS 配置无效: {err}")))
        })
        .collect::<AppResult<Vec<_>>>()?;

    Ok(CorsOrigins::List(parsed))
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
    use super::{parse_cors_origins, AppConfig, CorsOrigins, DEFAULT_HTTP_PORT};

    #[test]
    fn default_config_loads() {
        let config = AppConfig::from_env().expect("default config should load");

        assert_eq!(config.name, "rust-adminYH");
        assert!(config.database.max_connections > 0);
    }

    #[test]
    fn default_http_port_matches_desktop_contract() {
        assert_eq!(DEFAULT_HTTP_PORT, 16824);
    }

    #[test]
    fn local_cors_defaults_to_any_for_development() {
        assert_eq!(
            parse_cors_origins("local", None).expect("local CORS should parse"),
            CorsOrigins::Any
        );
    }

    #[test]
    fn production_requires_explicit_cors_origins() {
        let error = parse_cors_origins("production", None).expect_err("production should fail");

        assert!(error
            .to_string()
            .contains("APP_HTTP__CORS_ORIGINS 在 production 必须显式配置"));
    }

    #[test]
    fn production_rejects_wildcard_cors_origin() {
        let error = parse_cors_origins("production", Some("*".to_owned()))
            .expect_err("wildcard should fail in production");

        assert!(error
            .to_string()
            .contains("APP_HTTP__CORS_ORIGINS 在 production 不能包含 *"));
    }

    #[test]
    fn production_accepts_explicit_cors_origin_list() {
        assert_eq!(
            parse_cors_origins(
                "production",
                Some("http://127.0.0.1:16824, http://localhost:16824".to_owned())
            )
            .expect("explicit CORS origins should parse"),
            CorsOrigins::List(vec![
                "http://127.0.0.1:16824".to_owned(),
                "http://localhost:16824".to_owned()
            ])
        );
    }
}

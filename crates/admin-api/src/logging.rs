use admin_core::{AppError, AppResult};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Registry};

use crate::config::LoggingConfig;

pub struct LogGuard;

pub fn init(config: &LoggingConfig) -> AppResult<LogGuard> {
    let filter = EnvFilter::try_new(&config.level)
        .or_else(|_| EnvFilter::try_new("info"))
        .map_err(|err| AppError::Config(err.to_string()))?;

    let _json_logs = config.json_logs;
    Registry::default()
        .with(filter)
        .with(fmt::layer().compact())
        .try_init()
        .map_err(|err| AppError::Config(err.to_string()))?;

    Ok(LogGuard)
}

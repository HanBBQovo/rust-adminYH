use std::net::SocketAddr;

use admin_api::{build_router, logging, AppConfig, AppState};
use admin_core::services::StaticHealthService;
use anyhow::Context;
use tokio::net::TcpListener;
use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = AppConfig::from_env().context("加载应用配置失败")?;
    let _log_guard = logging::init(&config.logging)?;

    let address = SocketAddr::new(config.http.host, config.http.port);
    let state = AppState::new(
        config.clone(),
        StaticHealthService::new(config.name, env!("CARGO_PKG_VERSION")),
    );
    let app = build_router(state);
    let listener = TcpListener::bind(address).await?;

    info!(%address, "admin-api listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

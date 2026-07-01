use std::sync::Arc;

use admin_core::services::{AuthService, DisabledAuthService, HealthService, StaticHealthService};

use crate::config::AppConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub health_service: Arc<dyn HealthService>,
    pub auth_service: Arc<dyn AuthService>,
}

impl AppState {
    pub fn new(config: AppConfig, health_service: StaticHealthService) -> Self {
        Self::with_services(
            config,
            Arc::new(health_service),
            Arc::new(DisabledAuthService),
        )
    }

    pub fn with_services(
        config: AppConfig,
        health_service: Arc<dyn HealthService>,
        auth_service: Arc<dyn AuthService>,
    ) -> Self {
        Self {
            config: Arc::new(config),
            health_service,
            auth_service,
        }
    }
}

use std::sync::Arc;

use admin_core::services::{HealthService, StaticHealthService};

use crate::config::AppConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub health_service: Arc<dyn HealthService>,
}

impl AppState {
    pub fn new(config: AppConfig, health_service: StaticHealthService) -> Self {
        Self {
            config: Arc::new(config),
            health_service: Arc::new(health_service),
        }
    }
}

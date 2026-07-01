use std::sync::Arc;

use admin_core::services::{
    AuthService, CompanyService, DisabledAuthService, DisabledCompanyService, DisabledMenuService,
    HealthService, MenuService, StaticHealthService,
};

use crate::config::AppConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub health_service: Arc<dyn HealthService>,
    pub auth_service: Arc<dyn AuthService>,
    pub menu_service: Arc<dyn MenuService>,
    pub company_service: Arc<dyn CompanyService>,
}

impl AppState {
    pub fn new(config: AppConfig, health_service: StaticHealthService) -> Self {
        Self::with_services(
            config,
            Arc::new(health_service),
            Arc::new(DisabledAuthService),
            Arc::new(DisabledMenuService),
            Arc::new(DisabledCompanyService),
        )
    }

    pub fn with_services(
        config: AppConfig,
        health_service: Arc<dyn HealthService>,
        auth_service: Arc<dyn AuthService>,
        menu_service: Arc<dyn MenuService>,
        company_service: Arc<dyn CompanyService>,
    ) -> Self {
        Self {
            config: Arc::new(config),
            health_service,
            auth_service,
            menu_service,
            company_service,
        }
    }
}

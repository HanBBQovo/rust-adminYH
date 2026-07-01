use std::sync::Arc;

use admin_core::services::{
    AuthService, ChartService, CompanyService, DisabledAuthService, DisabledChartService,
    DisabledCompanyService, DisabledMenuService, DisabledOrderService, DisabledReceiptService,
    DisabledRoleService, DisabledUserService, HealthService, MemoryService, MenuService,
    OrderService, ReceiptService, RoleService, StaticHealthService, UserService,
};

use crate::config::AppConfig;

#[derive(Clone)]
pub struct AppServices {
    pub health_service: Arc<dyn HealthService>,
    pub auth_service: Arc<dyn AuthService>,
    pub menu_service: Arc<dyn MenuService>,
    pub chart_service: Arc<dyn ChartService>,
    pub company_service: Arc<dyn CompanyService>,
    pub user_service: Arc<dyn UserService>,
    pub role_service: Arc<dyn RoleService>,
    pub order_service: Arc<dyn OrderService>,
    pub receipt_service: Arc<dyn ReceiptService>,
    pub memory_service: Arc<dyn MemoryService>,
}

impl AppServices {
    pub fn disabled(health_service: StaticHealthService) -> Self {
        Self {
            health_service: Arc::new(health_service),
            auth_service: Arc::new(DisabledAuthService),
            menu_service: Arc::new(DisabledMenuService),
            chart_service: Arc::new(DisabledChartService),
            company_service: Arc::new(DisabledCompanyService),
            user_service: Arc::new(DisabledUserService),
            role_service: Arc::new(DisabledRoleService),
            order_service: Arc::new(DisabledOrderService),
            receipt_service: Arc::new(DisabledReceiptService),
            memory_service: Arc::new(admin_core::services::DisabledMemoryService),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub health_service: Arc<dyn HealthService>,
    pub auth_service: Arc<dyn AuthService>,
    pub menu_service: Arc<dyn MenuService>,
    pub chart_service: Arc<dyn ChartService>,
    pub company_service: Arc<dyn CompanyService>,
    pub user_service: Arc<dyn UserService>,
    pub role_service: Arc<dyn RoleService>,
    pub order_service: Arc<dyn OrderService>,
    pub receipt_service: Arc<dyn ReceiptService>,
    pub memory_service: Arc<dyn MemoryService>,
}

impl AppState {
    pub fn new(config: AppConfig, health_service: StaticHealthService) -> Self {
        Self::with_services(config, AppServices::disabled(health_service))
    }

    pub fn with_services(config: AppConfig, services: AppServices) -> Self {
        Self {
            config: Arc::new(config),
            health_service: services.health_service,
            auth_service: services.auth_service,
            menu_service: services.menu_service,
            chart_service: services.chart_service,
            company_service: services.company_service,
            user_service: services.user_service,
            role_service: services.role_service,
            order_service: services.order_service,
            receipt_service: services.receipt_service,
            memory_service: services.memory_service,
        }
    }
}

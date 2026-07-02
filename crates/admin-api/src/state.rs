use std::sync::Arc;

use admin_core::{
    auth::LegacyMd5PasswordVerifier,
    services::{
        AuthService, ChartService, CompanyService, CompatAuthService, CompatChartService,
        CompatCompanyService, CompatMemoryService, CompatMenuService, CompatOrderService,
        CompatReceiptService, CompatRoleService, CompatUserService, DevelopmentTokenIssuer,
        DisabledAuthService, DisabledChartService, DisabledCompanyService, DisabledMenuService,
        DisabledOrderService, DisabledReceiptService, DisabledRoleService, DisabledUserService,
        HealthService, MemoryService, MenuService, OrderService, ReceiptService, RoleService,
        StaticHealthService, UserService,
    },
};
use admin_db::{
    repositories::{
        MySqlChartRepository, MySqlCompanyRepository, MySqlMenuRepository, MySqlOrderRepository,
        MySqlRoleRepository, MySqlUserRepository,
    },
    MySqlPool,
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
    pub fn database(pool: MySqlPool, health_service: StaticHealthService) -> Self {
        let user_repository = Arc::new(MySqlUserRepository::new(pool.clone()));
        let menu_repository = Arc::new(MySqlMenuRepository::new(pool.clone()));
        let role_repository = Arc::new(MySqlRoleRepository::new(pool.clone()));
        let order_repository = Arc::new(MySqlOrderRepository::new(pool.clone()));

        Self {
            health_service: Arc::new(health_service),
            auth_service: Arc::new(CompatAuthService::new(
                user_repository.clone(),
                Arc::new(LegacyMd5PasswordVerifier),
                Arc::new(DevelopmentTokenIssuer::default()),
            )),
            menu_service: Arc::new(CompatMenuService::new(menu_repository)),
            chart_service: Arc::new(CompatChartService::new(Arc::new(
                MySqlChartRepository::new(pool.clone()),
            ))),
            company_service: Arc::new(CompatCompanyService::new(Arc::new(
                MySqlCompanyRepository::new(pool.clone()),
            ))),
            user_service: Arc::new(CompatUserService::new(user_repository)),
            role_service: Arc::new(CompatRoleService::new(role_repository)),
            order_service: Arc::new(CompatOrderService::new(order_repository.clone())),
            receipt_service: Arc::new(CompatReceiptService::new(order_repository.clone())),
            memory_service: Arc::new(CompatMemoryService::new(order_repository)),
        }
    }

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

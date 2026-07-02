use std::{future::Future, pin::Pin, sync::Arc};

use crate::domain::{HealthCheck, HealthReport};

pub type ServiceFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait HealthService: Send + Sync {
    fn report<'a>(&'a self) -> ServiceFuture<'a, HealthReport>;
}

pub trait HealthCheckService: Send + Sync {
    fn check<'a>(&'a self) -> ServiceFuture<'a, HealthCheck>;
}

#[derive(Debug, Clone)]
pub struct StaticHealthService {
    service_name: String,
    version: String,
}

impl StaticHealthService {
    pub fn new(service_name: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            service_name: service_name.into(),
            version: version.into(),
        }
    }

    pub fn with_check(self, check: Arc<dyn HealthCheckService>) -> RuntimeHealthService {
        self.with_checks([check])
    }

    pub fn with_checks(
        self,
        checks: impl IntoIterator<Item = Arc<dyn HealthCheckService>>,
    ) -> RuntimeHealthService {
        RuntimeHealthService {
            service_name: self.service_name,
            version: self.version,
            checks: checks.into_iter().collect(),
        }
    }
}

impl HealthService for StaticHealthService {
    fn report<'a>(&'a self) -> ServiceFuture<'a, HealthReport> {
        Box::pin(async move { HealthReport::ok(self.service_name.clone(), self.version.clone()) })
    }
}

#[derive(Clone)]
pub struct RuntimeHealthService {
    service_name: String,
    version: String,
    checks: Vec<Arc<dyn HealthCheckService>>,
}

impl HealthService for RuntimeHealthService {
    fn report<'a>(&'a self) -> ServiceFuture<'a, HealthReport> {
        Box::pin(async move {
            let mut checks = vec![HealthCheck::ok("service")];
            for check in &self.checks {
                checks.push(check.check().await);
            }
            HealthReport::from_checks(self.service_name.clone(), self.version.clone(), checks)
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::{HealthCheckService, HealthService, ServiceFuture, StaticHealthService};
    use crate::domain::{HealthCheck, ServiceStatus};

    #[tokio::test]
    async fn static_health_service_reports_ok() {
        let service = StaticHealthService::new("admin-api", "0.1.0");
        let report = service.report().await;

        assert_eq!(report.service, "admin-api");
        assert_eq!(report.status, ServiceStatus::Ok);
        assert_eq!(report.version, "0.1.0");
        assert_eq!(report.checks[0].name, "service");
        assert_eq!(report.checks[0].status, ServiceStatus::Ok);
    }

    #[tokio::test]
    async fn runtime_health_service_degrades_when_a_check_fails() {
        let service =
            StaticHealthService::new("admin-api", "0.1.0").with_check(Arc::new(FailingHealthCheck));
        let report = service.report().await;

        assert_eq!(report.status, ServiceStatus::Degraded);
        assert_eq!(report.checks[0].name, "service");
        assert_eq!(report.checks[1].name, "database");
        assert_eq!(report.checks[1].status, ServiceStatus::Degraded);
        assert_eq!(
            report.checks[1].message.as_deref(),
            Some("connection refused")
        );
    }

    struct FailingHealthCheck;

    impl HealthCheckService for FailingHealthCheck {
        fn check<'a>(&'a self) -> ServiceFuture<'a, HealthCheck> {
            Box::pin(async { HealthCheck::degraded("database", "connection refused") })
        }
    }
}

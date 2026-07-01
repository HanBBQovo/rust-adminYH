use crate::domain::HealthReport;

pub trait HealthService: Send + Sync {
    fn report(&self) -> HealthReport;
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
}

impl HealthService for StaticHealthService {
    fn report(&self) -> HealthReport {
        HealthReport::ok(self.service_name.clone(), self.version.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::{HealthService, StaticHealthService};
    use crate::domain::ServiceStatus;

    #[test]
    fn static_health_service_reports_ok() {
        let service = StaticHealthService::new("admin-api", "0.1.0");
        let report = service.report();

        assert_eq!(report.service, "admin-api");
        assert_eq!(report.status, ServiceStatus::Ok);
        assert_eq!(report.version, "0.1.0");
    }
}

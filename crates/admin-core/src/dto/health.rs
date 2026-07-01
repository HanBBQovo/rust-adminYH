use serde::Serialize;

use crate::domain::{HealthReport, ServiceStatus};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct HealthResponse {
    pub service: String,
    pub status: ServiceStatus,
    pub version: String,
}

impl From<HealthReport> for HealthResponse {
    fn from(value: HealthReport) -> Self {
        Self {
            service: value.service,
            status: value.status,
            version: value.version,
        }
    }
}

impl HealthResponse {
    pub fn ready(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
            status: ServiceStatus::Ok,
            version: env!("CARGO_PKG_VERSION").to_owned(),
        }
    }
}

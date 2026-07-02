use serde::Serialize;

use crate::domain::{HealthCheck, HealthReport, ServiceStatus};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct HealthCheckResponse {
    pub name: String,
    pub status: ServiceStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct HealthResponse {
    pub service: String,
    pub status: ServiceStatus,
    pub version: String,
    pub checks: Vec<HealthCheckResponse>,
}

impl From<HealthReport> for HealthResponse {
    fn from(value: HealthReport) -> Self {
        Self {
            service: value.service,
            status: value.status,
            version: value.version,
            checks: value
                .checks
                .into_iter()
                .map(HealthCheckResponse::from)
                .collect(),
        }
    }
}

impl From<HealthCheck> for HealthCheckResponse {
    fn from(value: HealthCheck) -> Self {
        Self {
            name: value.name,
            status: value.status,
            message: value.message,
        }
    }
}

impl HealthResponse {
    pub fn ready(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
            status: ServiceStatus::Ok,
            version: env!("CARGO_PKG_VERSION").to_owned(),
            checks: vec![HealthCheckResponse {
                name: "service".to_owned(),
                status: ServiceStatus::Ok,
                message: None,
            }],
        }
    }
}

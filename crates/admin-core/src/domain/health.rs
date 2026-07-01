use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ServiceStatus {
    Ok,
    Degraded,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct HealthReport {
    pub service: String,
    pub status: ServiceStatus,
    pub version: String,
}

impl HealthReport {
    pub fn ok(service: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            service: service.into(),
            status: ServiceStatus::Ok,
            version: version.into(),
        }
    }
}

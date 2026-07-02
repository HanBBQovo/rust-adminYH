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
    pub checks: Vec<HealthCheck>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct HealthCheck {
    pub name: String,
    pub status: ServiceStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl HealthReport {
    pub fn ok(service: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            service: service.into(),
            status: ServiceStatus::Ok,
            version: version.into(),
            checks: vec![HealthCheck::ok("service")],
        }
    }

    pub fn from_checks(
        service: impl Into<String>,
        version: impl Into<String>,
        checks: Vec<HealthCheck>,
    ) -> Self {
        let status = if checks
            .iter()
            .any(|check| check.status == ServiceStatus::Degraded)
        {
            ServiceStatus::Degraded
        } else {
            ServiceStatus::Ok
        };

        Self {
            service: service.into(),
            status,
            version: version.into(),
            checks,
        }
    }
}

impl HealthCheck {
    pub fn ok(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            status: ServiceStatus::Ok,
            message: None,
        }
    }

    pub fn degraded(name: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            status: ServiceStatus::Degraded,
            message: Some(message.into()),
        }
    }
}

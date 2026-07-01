use admin_core::AppResult;

pub trait HealthRepository: Send + Sync {
    fn ping(&self) -> impl std::future::Future<Output = AppResult<()>> + Send;
}

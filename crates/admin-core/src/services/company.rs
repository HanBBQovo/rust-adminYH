use std::{
    collections::HashMap,
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

use crate::{
    domain::Company,
    dto::{CompanyListRequest, CompanyListResponse, CompanyMutationRequest, LegacyCompanyRecord},
    AppError, AppResult,
};

pub type ServiceFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait CompanyService: Send + Sync {
    fn list<'a>(
        &'a self,
        input: CompanyListRequest,
    ) -> ServiceFuture<'a, AppResult<CompanyListResponse>>;

    fn detail<'a>(
        &'a self,
        company_id: i64,
    ) -> ServiceFuture<'a, AppResult<Vec<LegacyCompanyRecord>>>;

    fn create<'a>(&'a self, input: CompanyMutationRequest) -> ServiceFuture<'a, AppResult<()>>;

    fn update<'a>(
        &'a self,
        company_id: i64,
        input: CompanyMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>>;

    fn remove<'a>(&'a self, company_id: i64) -> ServiceFuture<'a, AppResult<()>>;
}

pub trait CompanyStore: Send + Sync {
    fn list<'a>(&'a self, offset: usize, size: usize)
        -> ServiceFuture<'a, AppResult<Vec<Company>>>;

    fn count<'a>(&'a self) -> ServiceFuture<'a, AppResult<usize>>;

    fn detail<'a>(&'a self, company_id: i64) -> ServiceFuture<'a, AppResult<Vec<Company>>>;

    fn create<'a>(&'a self, name: &'a str) -> ServiceFuture<'a, AppResult<()>>;

    fn update<'a>(&'a self, company_id: i64, name: &'a str) -> ServiceFuture<'a, AppResult<()>>;

    fn remove<'a>(&'a self, company_id: i64) -> ServiceFuture<'a, AppResult<()>>;
}

pub struct CompatCompanyService {
    store: Arc<dyn CompanyStore>,
}

impl CompatCompanyService {
    pub fn new(store: Arc<dyn CompanyStore>) -> Self {
        Self { store }
    }
}

impl CompanyService for CompatCompanyService {
    fn list<'a>(
        &'a self,
        input: CompanyListRequest,
    ) -> ServiceFuture<'a, AppResult<CompanyListResponse>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let list = store
                .list(input.offset, input.size)
                .await?
                .into_iter()
                .map(LegacyCompanyRecord::from)
                .collect();
            let total_count = store.count().await?;
            Ok(CompanyListResponse { list, total_count })
        })
    }

    fn detail<'a>(
        &'a self,
        company_id: i64,
    ) -> ServiceFuture<'a, AppResult<Vec<LegacyCompanyRecord>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            Ok(store
                .detail(company_id)
                .await?
                .into_iter()
                .map(LegacyCompanyRecord::from)
                .collect())
        })
    }

    fn create<'a>(&'a self, input: CompanyMutationRequest) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let name = normalize_company_name(&input.name)?;
            store.create(&name).await
        })
    }

    fn update<'a>(
        &'a self,
        company_id: i64,
        input: CompanyMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let name = normalize_company_name(&input.name)?;
            store.update(company_id, &name).await
        })
    }

    fn remove<'a>(&'a self, company_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move { store.remove(company_id).await })
    }
}

#[derive(Debug, Default)]
pub struct DisabledCompanyService;

impl CompanyService for DisabledCompanyService {
    fn list<'a>(
        &'a self,
        _input: CompanyListRequest,
    ) -> ServiceFuture<'a, AppResult<CompanyListResponse>> {
        Box::pin(async {
            Err(AppError::Database("公司服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn detail<'a>(
        &'a self,
        _company_id: i64,
    ) -> ServiceFuture<'a, AppResult<Vec<LegacyCompanyRecord>>> {
        Box::pin(async {
            Err(AppError::Database("公司服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn create<'a>(&'a self, _input: CompanyMutationRequest) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("公司服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn update<'a>(
        &'a self,
        _company_id: i64,
        _input: CompanyMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("公司服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn remove<'a>(&'a self, _company_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("公司服务尚未连接数据库仓储".to_owned()))
        })
    }
}

#[derive(Debug)]
pub struct InMemoryCompanyStore {
    companies: Mutex<Vec<Company>>,
    next_id: Mutex<i64>,
}

impl InMemoryCompanyStore {
    pub fn with_seed_data() -> Self {
        Self {
            companies: Mutex::new(vec![
                Company::new(
                    1,
                    "顺丰速运",
                    "2026-01-01T00:00:00Z",
                    "2026-01-02T00:00:00Z",
                    2,
                ),
                Company::new(
                    2,
                    "德邦物流",
                    "2026-01-03T00:00:00Z",
                    "2026-01-04T00:00:00Z",
                    0,
                ),
            ]),
            next_id: Mutex::new(3),
        }
    }
}

impl Default for InMemoryCompanyStore {
    fn default() -> Self {
        Self {
            companies: Mutex::new(Vec::new()),
            next_id: Mutex::new(1),
        }
    }
}

impl CompanyStore for InMemoryCompanyStore {
    fn list<'a>(
        &'a self,
        offset: usize,
        size: usize,
    ) -> ServiceFuture<'a, AppResult<Vec<Company>>> {
        Box::pin(async move {
            Ok(self
                .companies
                .lock()
                .map_err(|_| AppError::Internal)?
                .iter()
                .skip(offset)
                .take(size)
                .cloned()
                .collect())
        })
    }

    fn count<'a>(&'a self) -> ServiceFuture<'a, AppResult<usize>> {
        Box::pin(async move { Ok(self.companies.lock().map_err(|_| AppError::Internal)?.len()) })
    }

    fn detail<'a>(&'a self, company_id: i64) -> ServiceFuture<'a, AppResult<Vec<Company>>> {
        Box::pin(async move {
            Ok(self
                .companies
                .lock()
                .map_err(|_| AppError::Internal)?
                .iter()
                .filter(|company| company.id == company_id)
                .cloned()
                .collect())
        })
    }

    fn create<'a>(&'a self, name: &'a str) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut companies = self.companies.lock().map_err(|_| AppError::Internal)?;
            ensure_unique_name(&companies, name, None)?;
            let mut next_id = self.next_id.lock().map_err(|_| AppError::Internal)?;
            companies.push(Company::new(
                *next_id,
                name,
                "2026-07-01T00:00:00Z",
                "2026-07-01T00:00:00Z",
                0,
            ));
            *next_id += 1;
            Ok(())
        })
    }

    fn update<'a>(&'a self, company_id: i64, name: &'a str) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut companies = self.companies.lock().map_err(|_| AppError::Internal)?;
            ensure_unique_name(&companies, name, Some(company_id))?;
            let company = companies
                .iter_mut()
                .find(|company| company.id == company_id)
                .ok_or_else(|| AppError::NotFound(format!("company {company_id}")))?;
            company.name = name.to_owned();
            company.update_at = "2026-07-01T00:00:00Z".to_owned();
            Ok(())
        })
    }

    fn remove<'a>(&'a self, company_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut companies = self.companies.lock().map_err(|_| AppError::Internal)?;
            let original_len = companies.len();
            companies.retain(|company| company.id != company_id);
            if companies.len() == original_len {
                return Err(AppError::NotFound(format!("company {company_id}")));
            }
            Ok(())
        })
    }
}

pub fn development_company_service() -> CompatCompanyService {
    CompatCompanyService::new(Arc::new(InMemoryCompanyStore::with_seed_data()))
}

fn normalize_company_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Validation("发货公司不能为空！".to_owned()));
    }
    Ok(name.to_owned())
}

fn ensure_unique_name(
    companies: &[Company],
    name: &str,
    ignore_company_id: Option<i64>,
) -> AppResult<()> {
    let by_id = ignore_company_id
        .map(|id| HashMap::from([(id, true)]))
        .unwrap_or_default();
    let duplicate = companies
        .iter()
        .any(|company| company.name == name && !by_id.contains_key(&company.id));
    if duplicate {
        return Err(AppError::Validation("发货公司已存在".to_owned()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::{
        dto::{CompanyListRequest, CompanyMutationRequest},
        services::{development_company_service, CompanyService},
    };

    #[tokio::test]
    async fn company_list_keeps_legacy_count_order_field() {
        let service = development_company_service();

        let response = service
            .list(CompanyListRequest {
                offset: 0,
                size: 10,
            })
            .await
            .expect("company list should load");

        assert_eq!(response.total_count, 2);
        assert_eq!(response.list[0].name, "顺丰速运");
        assert_eq!(response.list[0].count_order, 2);
    }

    #[tokio::test]
    async fn company_detail_keeps_old_array_shape() {
        let service = development_company_service();

        let response = service.detail(1).await.expect("company detail should load");

        assert_eq!(response.len(), 1);
        assert_eq!(response[0].name, "顺丰速运");
    }

    #[tokio::test]
    async fn company_create_update_remove_mutates_store() {
        let service = development_company_service();

        service
            .create(CompanyMutationRequest {
                name: "跨越速运".to_owned(),
            })
            .await
            .expect("company should create");
        assert_eq!(
            service
                .list(CompanyListRequest {
                    offset: 0,
                    size: 10
                })
                .await
                .unwrap()
                .total_count,
            3
        );

        service
            .update(
                3,
                CompanyMutationRequest {
                    name: "跨越物流".to_owned(),
                },
            )
            .await
            .expect("company should update");
        assert_eq!(service.detail(3).await.unwrap()[0].name, "跨越物流");

        service.remove(3).await.expect("company should delete");
        assert!(service.detail(3).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn company_name_is_required() {
        let service = development_company_service();

        let error = service
            .create(CompanyMutationRequest {
                name: "  ".to_owned(),
            })
            .await
            .expect_err("empty name should fail");

        assert_eq!(error.legacy_code(), -400);
        assert_eq!(error.to_string(), "请求参数错误: 发货公司不能为空！");
    }
}

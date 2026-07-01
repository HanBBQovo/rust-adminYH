use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

use crate::{
    dto::{RoleAssignRequest, RoleListRequest, RoleListResponse, RoleMutationRequest, RoleRecord},
    AppError, AppResult,
};

pub type ServiceFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait RoleService: Send + Sync {
    fn list<'a>(&'a self, input: RoleListRequest)
        -> ServiceFuture<'a, AppResult<RoleListResponse>>;

    fn detail<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<Option<RoleRecord>>>;

    fn create<'a>(&'a self, input: RoleMutationRequest) -> ServiceFuture<'a, AppResult<()>>;

    fn update<'a>(
        &'a self,
        role_id: i64,
        input: RoleMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>>;

    fn remove<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<()>>;

    fn assign<'a>(&'a self, input: RoleAssignRequest) -> ServiceFuture<'a, AppResult<()>>;
}

pub trait RoleStore: Send + Sync {
    fn list<'a>(
        &'a self,
        input: &'a RoleListRequest,
    ) -> ServiceFuture<'a, AppResult<Vec<RoleRecord>>>;

    fn count<'a>(&'a self, input: &'a RoleListRequest) -> ServiceFuture<'a, AppResult<usize>>;

    fn find_by_id<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<Option<RoleRecord>>>;

    fn create<'a>(&'a self, input: RoleMutationRequest) -> ServiceFuture<'a, AppResult<()>>;

    fn update<'a>(
        &'a self,
        role_id: i64,
        input: RoleMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>>;

    fn remove<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<()>>;

    fn replace_menu_ids<'a>(
        &'a self,
        role_id: i64,
        menu_ids: Vec<i64>,
    ) -> ServiceFuture<'a, AppResult<()>>;
}

pub struct CompatRoleService {
    store: Arc<dyn RoleStore>,
}

impl CompatRoleService {
    pub fn new(store: Arc<dyn RoleStore>) -> Self {
        Self { store }
    }
}

impl RoleService for CompatRoleService {
    fn list<'a>(
        &'a self,
        input: RoleListRequest,
    ) -> ServiceFuture<'a, AppResult<RoleListResponse>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let list = store.list(&input).await?;
            let total_count = store.count(&input).await?;
            Ok(RoleListResponse { list, total_count })
        })
    }

    fn detail<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<Option<RoleRecord>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move { store.find_by_id(role_id).await })
    }

    fn create<'a>(&'a self, input: RoleMutationRequest) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            normalize_role(&input)?;
            store
                .create(RoleMutationRequest {
                    name: input.name.trim().to_owned(),
                    intro: input.intro.trim().to_owned(),
                })
                .await
        })
    }

    fn update<'a>(
        &'a self,
        role_id: i64,
        input: RoleMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            normalize_role(&input)?;
            store
                .update(
                    role_id,
                    RoleMutationRequest {
                        name: input.name.trim().to_owned(),
                        intro: input.intro.trim().to_owned(),
                    },
                )
                .await
        })
    }

    fn remove<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move { store.remove(role_id).await })
    }

    fn assign<'a>(&'a self, input: RoleAssignRequest) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            if input.role_id <= 0 {
                return Err(AppError::Validation("角色不能为空".to_owned()));
            }
            store.replace_menu_ids(input.role_id, input.menu_list).await
        })
    }
}

#[derive(Debug, Default)]
pub struct DisabledRoleService;

impl RoleService for DisabledRoleService {
    fn list<'a>(
        &'a self,
        _input: RoleListRequest,
    ) -> ServiceFuture<'a, AppResult<RoleListResponse>> {
        Box::pin(async {
            Err(AppError::Database("角色服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn detail<'a>(&'a self, _role_id: i64) -> ServiceFuture<'a, AppResult<Option<RoleRecord>>> {
        Box::pin(async {
            Err(AppError::Database("角色服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn create<'a>(&'a self, _input: RoleMutationRequest) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("角色服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn update<'a>(
        &'a self,
        _role_id: i64,
        _input: RoleMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("角色服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn remove<'a>(&'a self, _role_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("角色服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn assign<'a>(&'a self, _input: RoleAssignRequest) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("角色服务尚未连接数据库仓储".to_owned()))
        })
    }
}

#[derive(Debug)]
pub struct InMemoryRoleStore {
    roles: Mutex<Vec<RoleRecord>>,
    role_menu_ids: Mutex<Vec<(i64, i64)>>,
    next_id: Mutex<i64>,
}

impl InMemoryRoleStore {
    pub fn with_seed_data() -> Self {
        Self {
            roles: Mutex::new(vec![
                RoleRecord::new(
                    1,
                    "超级管理员",
                    "所有权限",
                    "2026-01-01T00:00:00Z",
                    "2026-01-01T00:00:00Z",
                ),
                RoleRecord::new(
                    2,
                    "普通用户",
                    "部分权限",
                    "2026-01-02T00:00:00Z",
                    "2026-01-02T00:00:00Z",
                ),
            ]),
            role_menu_ids: Mutex::new(vec![(1, 1), (1, 11), (1, 2), (1, 21), (1, 3), (1, 31)]),
            next_id: Mutex::new(3),
        }
    }
}

impl Default for InMemoryRoleStore {
    fn default() -> Self {
        Self {
            roles: Mutex::new(Vec::new()),
            role_menu_ids: Mutex::new(Vec::new()),
            next_id: Mutex::new(1),
        }
    }
}

impl RoleStore for InMemoryRoleStore {
    fn list<'a>(
        &'a self,
        input: &'a RoleListRequest,
    ) -> ServiceFuture<'a, AppResult<Vec<RoleRecord>>> {
        Box::pin(async move {
            Ok(
                filter_roles(&self.roles.lock().map_err(|_| AppError::Internal)?, input)
                    .into_iter()
                    .skip(input.offset)
                    .take(input.size)
                    .collect(),
            )
        })
    }

    fn count<'a>(&'a self, input: &'a RoleListRequest) -> ServiceFuture<'a, AppResult<usize>> {
        Box::pin(async move {
            Ok(filter_roles(&self.roles.lock().map_err(|_| AppError::Internal)?, input).len())
        })
    }

    fn find_by_id<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<Option<RoleRecord>>> {
        Box::pin(async move {
            Ok(self
                .roles
                .lock()
                .map_err(|_| AppError::Internal)?
                .iter()
                .find(|role| role.id == role_id)
                .cloned())
        })
    }

    fn create<'a>(&'a self, input: RoleMutationRequest) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut next_id = self.next_id.lock().map_err(|_| AppError::Internal)?;
            self.roles
                .lock()
                .map_err(|_| AppError::Internal)?
                .push(RoleRecord::new(
                    *next_id,
                    input.name,
                    input.intro,
                    "2026-07-01T00:00:00Z",
                    "2026-07-01T00:00:00Z",
                ));
            *next_id += 1;
            Ok(())
        })
    }

    fn update<'a>(
        &'a self,
        role_id: i64,
        input: RoleMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut roles = self.roles.lock().map_err(|_| AppError::Internal)?;
            let role = roles
                .iter_mut()
                .find(|role| role.id == role_id)
                .ok_or_else(|| AppError::NotFound(format!("role {role_id}")))?;
            role.name = input.name;
            role.intro = input.intro;
            role.update_at = "2026-07-01T00:00:00Z".to_owned();
            Ok(())
        })
    }

    fn remove<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut roles = self.roles.lock().map_err(|_| AppError::Internal)?;
            let original_len = roles.len();
            roles.retain(|role| role.id != role_id);
            if roles.len() == original_len {
                return Err(AppError::NotFound(format!("role {role_id}")));
            }
            self.role_menu_ids
                .lock()
                .map_err(|_| AppError::Internal)?
                .retain(|(existing_role_id, _)| *existing_role_id != role_id);
            Ok(())
        })
    }

    fn replace_menu_ids<'a>(
        &'a self,
        role_id: i64,
        menu_ids: Vec<i64>,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            if self.find_by_id(role_id).await?.is_none() {
                return Err(AppError::NotFound(format!("role {role_id}")));
            }
            let mut role_menu_ids = self.role_menu_ids.lock().map_err(|_| AppError::Internal)?;
            role_menu_ids.retain(|(existing_role_id, _)| *existing_role_id != role_id);
            for menu_id in menu_ids {
                if !role_menu_ids.contains(&(role_id, menu_id)) {
                    role_menu_ids.push((role_id, menu_id));
                }
            }
            Ok(())
        })
    }
}

pub fn development_role_service() -> CompatRoleService {
    CompatRoleService::new(Arc::new(InMemoryRoleStore::with_seed_data()))
}

fn normalize_role(input: &RoleMutationRequest) -> AppResult<()> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("角色名不能为空".to_owned()));
    }
    if input.intro.trim().is_empty() {
        return Err(AppError::Validation("权限介绍不能为空".to_owned()));
    }
    Ok(())
}

fn filter_roles(roles: &[RoleRecord], input: &RoleListRequest) -> Vec<RoleRecord> {
    let name = input.name.as_deref().unwrap_or("").trim();
    let intro = input.intro.as_deref().unwrap_or("").trim();
    roles
        .iter()
        .filter(|role| name.is_empty() || role.name.contains(name))
        .filter(|role| intro.is_empty() || role.intro.contains(intro))
        .filter(|role| {
            let Some(range) = &input.create_at else {
                return true;
            };
            let [start, end] = range.as_slice() else {
                return true;
            };
            let date = role
                .create_at
                .split('T')
                .next()
                .unwrap_or(role.create_at.as_str());
            date >= start.as_str() && date <= end.as_str()
        })
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use crate::{
        dto::{RoleAssignRequest, RoleListRequest, RoleMutationRequest},
        services::{development_role_service, RoleService},
    };

    #[tokio::test]
    async fn role_list_filters_by_name_intro_and_create_at() {
        let service = development_role_service();

        let response = service
            .list(RoleListRequest {
                offset: 0,
                size: 10,
                name: Some("超级".to_owned()),
                intro: Some("所有".to_owned()),
                create_at: Some(vec!["2026-01-01".to_owned(), "2026-01-31".to_owned()]),
            })
            .await
            .expect("roles should list");

        assert_eq!(response.total_count, 1);
        assert_eq!(response.list[0].id, 1);
    }

    #[tokio::test]
    async fn role_create_update_remove_mutates_store() {
        let service = development_role_service();

        service
            .create(RoleMutationRequest {
                name: "财务".to_owned(),
                intro: "部分权限".to_owned(),
            })
            .await
            .expect("role should create");
        assert_eq!(service.detail(3).await.unwrap().unwrap().name, "财务");

        service
            .update(
                3,
                RoleMutationRequest {
                    name: "财务主管".to_owned(),
                    intro: "所有权限".to_owned(),
                },
            )
            .await
            .expect("role should update");
        assert_eq!(service.detail(3).await.unwrap().unwrap().intro, "所有权限");

        service.remove(3).await.expect("role should delete");
        assert!(service.detail(3).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn role_assign_replaces_menu_ids_idempotently() {
        let service = development_role_service();

        service
            .assign(RoleAssignRequest {
                role_id: 2,
                menu_list: vec![1, 11, 11],
            })
            .await
            .expect("menus should assign");
        service
            .assign(RoleAssignRequest {
                role_id: 2,
                menu_list: vec![2, 21],
            })
            .await
            .expect("menus should replace");

        assert_eq!(service.detail(2).await.unwrap().unwrap().name, "普通用户");
    }
}

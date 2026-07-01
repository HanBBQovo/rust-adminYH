use std::{
    collections::{HashMap, HashSet},
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

use crate::{
    domain::MenuNode,
    dto::{LegacyMenuNode, RoleMenuIdsResponse},
    AppError, AppResult,
};

pub type ServiceFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait MenuService: Send + Sync {
    fn role_menu_tree<'a>(
        &'a self,
        role_id: i64,
    ) -> ServiceFuture<'a, AppResult<Vec<LegacyMenuNode>>>;

    fn menu_tree<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<LegacyMenuNode>>>;

    fn role_menu_ids<'a>(
        &'a self,
        role_id: i64,
    ) -> ServiceFuture<'a, AppResult<RoleMenuIdsResponse>>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoleSummary {
    pub id: i64,
    pub name: String,
    pub intro: String,
}

pub trait MenuStore: Send + Sync {
    fn role_summary<'a>(
        &'a self,
        role_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<RoleSummary>>>;

    fn menu_tree<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<MenuNode>>>;

    fn menu_ids_for_role<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<Vec<i64>>>;
}

pub struct CompatMenuService {
    store: Arc<dyn MenuStore>,
}

impl CompatMenuService {
    pub fn new(store: Arc<dyn MenuStore>) -> Self {
        Self { store }
    }
}

impl MenuService for CompatMenuService {
    fn role_menu_tree<'a>(
        &'a self,
        role_id: i64,
    ) -> ServiceFuture<'a, AppResult<Vec<LegacyMenuNode>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let allowed_ids = store.menu_ids_for_role(role_id).await?;
            let allowed = allowed_ids.iter().copied().collect::<HashSet<_>>();
            let roots = store.menu_tree().await?;
            Ok(filter_menu_tree(roots, &allowed)
                .into_iter()
                .map(LegacyMenuNode::from_role_menu)
                .collect())
        })
    }

    fn menu_tree<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<LegacyMenuNode>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            Ok(store
                .menu_tree()
                .await?
                .into_iter()
                .map(LegacyMenuNode::from_menu_tree)
                .collect())
        })
    }

    fn role_menu_ids<'a>(
        &'a self,
        role_id: i64,
    ) -> ServiceFuture<'a, AppResult<RoleMenuIdsResponse>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let role = store
                .role_summary(role_id)
                .await?
                .ok_or_else(|| AppError::NotFound(format!("role {role_id}")))?;
            let menu_ids = store.menu_ids_for_role(role_id).await?;

            Ok(RoleMenuIdsResponse {
                id: role.id,
                name: role.name,
                intro: role.intro,
                menu_ids,
            })
        })
    }
}

#[derive(Debug, Default)]
pub struct DisabledMenuService;

impl MenuService for DisabledMenuService {
    fn role_menu_tree<'a>(
        &'a self,
        _role_id: i64,
    ) -> ServiceFuture<'a, AppResult<Vec<LegacyMenuNode>>> {
        Box::pin(async {
            Err(AppError::Database("菜单服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn menu_tree<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<LegacyMenuNode>>> {
        Box::pin(async {
            Err(AppError::Database("菜单服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn role_menu_ids<'a>(
        &'a self,
        _role_id: i64,
    ) -> ServiceFuture<'a, AppResult<RoleMenuIdsResponse>> {
        Box::pin(async {
            Err(AppError::Database("菜单服务尚未连接数据库仓储".to_owned()))
        })
    }
}

#[derive(Debug, Default)]
pub struct InMemoryMenuStore {
    roles: Mutex<HashMap<i64, RoleSummary>>,
    roots: Mutex<Vec<MenuNode>>,
    role_permissions: Mutex<HashMap<i64, Vec<i64>>>,
}

impl InMemoryMenuStore {
    pub fn with_seed_data() -> Self {
        let workspace = MenuNode::root(1, "工作台", "/main/analysis/overview", 1).with_children([
            MenuNode::child(11, "核心统计", "/main/analysis/dashboard", 1, 1),
        ]);
        let order = MenuNode::root(2, "订单管理", "/main/order", 2)
            .with_children([MenuNode::child(21, "运单列表", "/main/order/list", 1, 2)]);
        let settings = MenuNode::root(3, "系统设置", "/main/settings", 3)
            .with_children([MenuNode::child(31, "用户管理", "/main/system/user", 1, 3)]);

        Self {
            roles: Mutex::new(HashMap::from([(
                1,
                RoleSummary {
                    id: 1,
                    name: "超级管理员".to_owned(),
                    intro: "系统内置管理员".to_owned(),
                },
            )])),
            roots: Mutex::new(vec![workspace, order, settings]),
            role_permissions: Mutex::new(HashMap::from([(1, vec![1, 11, 2, 21, 3, 31])])),
        }
    }
}

impl MenuStore for InMemoryMenuStore {
    fn role_summary<'a>(
        &'a self,
        role_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<RoleSummary>>> {
        Box::pin(async move {
            Ok(self
                .roles
                .lock()
                .map_err(|_| AppError::Internal)?
                .get(&role_id)
                .cloned())
        })
    }

    fn menu_tree<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<MenuNode>>> {
        Box::pin(async move {
            let mut roots = self.roots.lock().map_err(|_| AppError::Internal)?.clone();
            sort_menu_tree(&mut roots);
            Ok(roots)
        })
    }

    fn menu_ids_for_role<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<Vec<i64>>> {
        Box::pin(async move {
            Ok(self
                .role_permissions
                .lock()
                .map_err(|_| AppError::Internal)?
                .get(&role_id)
                .cloned()
                .unwrap_or_default())
        })
    }
}

pub fn development_menu_service() -> CompatMenuService {
    CompatMenuService::new(Arc::new(InMemoryMenuStore::with_seed_data()))
}

fn filter_menu_tree(roots: Vec<MenuNode>, allowed: &HashSet<i64>) -> Vec<MenuNode> {
    roots
        .into_iter()
        .filter_map(|mut node| {
            node.children = filter_menu_tree(node.children, allowed);
            (allowed.contains(&node.id) || !node.children.is_empty()).then_some(node)
        })
        .collect()
}

fn sort_menu_tree(nodes: &mut [MenuNode]) {
    nodes.sort_by_key(|node| (node.sort, node.id));
    for node in nodes {
        sort_menu_tree(&mut node.children);
    }
}

#[cfg(test)]
mod tests {
    use crate::services::{development_menu_service, MenuService};

    #[tokio::test]
    async fn role_menu_tree_returns_legacy_children_shape() {
        let service = development_menu_service();

        let menus = service
            .role_menu_tree(1)
            .await
            .expect("role menus should load");

        assert_eq!(menus[0].name, "工作台");
        assert_eq!(menus[0].children[0].name, "核心统计");
        assert_eq!(menus[0].children[0].legacy_parent_id, Some(1));
    }

    #[tokio::test]
    async fn full_menu_tree_keeps_old_chilren_typo_for_compatibility() {
        let service = development_menu_service();

        let menus = service.menu_tree().await.expect("menu tree should load");

        assert_eq!(menus[1].name, "订单管理");
        assert_eq!(menus[1].legacy_children[0].name, "运单列表");
        assert!(menus[1].children.is_empty());
    }

    #[tokio::test]
    async fn role_menu_ids_returns_role_summary_and_menu_ids() {
        let service = development_menu_service();

        let response = service
            .role_menu_ids(1)
            .await
            .expect("menu ids should load");

        assert_eq!(response.id, 1);
        assert_eq!(response.name, "超级管理员");
        assert!(response.menu_ids.contains(&21));
    }
}

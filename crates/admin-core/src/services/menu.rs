use std::{
    collections::{HashMap, HashSet},
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

use crate::{
    auth::is_super_admin,
    domain::MenuNode,
    dto::{LegacyMenuNode, MenuMutationRequest, RoleMenuIdsResponse},
    AppError, AppResult,
};

pub type ServiceFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait MenuService: Send + Sync {
    fn role_menu_tree<'a>(
        &'a self,
        role_id: i64,
    ) -> ServiceFuture<'a, AppResult<Vec<LegacyMenuNode>>>;

    fn menu_tree<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<LegacyMenuNode>>>;

    fn detail<'a>(&'a self, menu_id: i64) -> ServiceFuture<'a, AppResult<Option<LegacyMenuNode>>>;

    fn create<'a>(&'a self, input: MenuMutationRequest) -> ServiceFuture<'a, AppResult<()>>;

    fn update<'a>(
        &'a self,
        menu_id: i64,
        input: MenuMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>>;

    fn remove<'a>(&'a self, menu_id: i64) -> ServiceFuture<'a, AppResult<()>>;

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

    fn find_by_id<'a>(&'a self, menu_id: i64) -> ServiceFuture<'a, AppResult<Option<MenuNode>>>;

    fn create<'a>(&'a self, input: MenuCreateRecord) -> ServiceFuture<'a, AppResult<()>>;

    fn update<'a>(
        &'a self,
        menu_id: i64,
        input: MenuCreateRecord,
    ) -> ServiceFuture<'a, AppResult<()>>;

    fn remove<'a>(&'a self, menu_id: i64) -> ServiceFuture<'a, AppResult<()>>;

    fn menu_ids_for_role<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<Vec<i64>>>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MenuCreateRecord {
    pub name: String,
    pub menu_type: i32,
    pub url: Option<String>,
    pub icon: Option<String>,
    pub sort: i32,
    pub parent_id: Option<i64>,
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
            let roots = store.menu_tree().await?;
            if is_super_admin(&[role_id]) {
                return Ok(roots
                    .into_iter()
                    .map(LegacyMenuNode::from_role_menu)
                    .collect());
            }

            let allowed_ids = store.menu_ids_for_role(role_id).await?;
            let allowed = allowed_ids.iter().copied().collect::<HashSet<_>>();
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
                .map(LegacyMenuNode::from_full_menu_tree)
                .collect())
        })
    }

    fn create<'a>(&'a self, input: MenuMutationRequest) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let input = normalize_menu(input)?;
            store.create(input).await
        })
    }

    fn detail<'a>(&'a self, menu_id: i64) -> ServiceFuture<'a, AppResult<Option<LegacyMenuNode>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            Ok(store
                .find_by_id(menu_id)
                .await?
                .map(LegacyMenuNode::from_menu_tree))
        })
    }

    fn update<'a>(
        &'a self,
        menu_id: i64,
        input: MenuMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let input = normalize_menu(input)?;
            let roots = store.menu_tree().await?;
            let current = find_menu(&roots, menu_id)
                .ok_or_else(|| AppError::NotFound(format!("menu {menu_id}")))?;
            if !current.children.is_empty() && input.menu_type == 2 {
                return Err(AppError::Validation("父级菜单不能修改为子菜单".to_owned()));
            }
            if input.parent_id == Some(menu_id) {
                return Err(AppError::Validation("父级菜单不能选择自身".to_owned()));
            }
            if let Some(parent_id) = input.parent_id {
                find_menu(&roots, parent_id)
                    .ok_or_else(|| AppError::NotFound(format!("menu {parent_id}")))?;
                if has_descendant_id(current, parent_id) {
                    return Err(AppError::Validation(
                        "父级菜单不能选择自己的子菜单".to_owned(),
                    ));
                }
            }

            store.update(menu_id, input).await
        })
    }

    fn remove<'a>(&'a self, menu_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let roots = store.menu_tree().await?;
            let current = find_menu(&roots, menu_id)
                .ok_or_else(|| AppError::NotFound(format!("menu {menu_id}")))?;
            if !current.children.is_empty() {
                return Err(AppError::Validation("存在子菜单，不能删除".to_owned()));
            }
            store.remove(menu_id).await
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
            let menu_ids = if is_super_admin(&[role_id]) {
                collect_menu_ids(&store.menu_tree().await?)
            } else {
                store.menu_ids_for_role(role_id).await?
            };

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

    fn detail<'a>(&'a self, _menu_id: i64) -> ServiceFuture<'a, AppResult<Option<LegacyMenuNode>>> {
        Box::pin(async {
            Err(AppError::Database("菜单服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn create<'a>(&'a self, _input: MenuMutationRequest) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("菜单服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn update<'a>(
        &'a self,
        _menu_id: i64,
        _input: MenuMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("菜单服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn remove<'a>(&'a self, _menu_id: i64) -> ServiceFuture<'a, AppResult<()>> {
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
    next_id: Mutex<i64>,
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
            next_id: Mutex::new(32),
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

    fn find_by_id<'a>(&'a self, menu_id: i64) -> ServiceFuture<'a, AppResult<Option<MenuNode>>> {
        Box::pin(async move {
            Ok(find_menu(&self.roots.lock().map_err(|_| AppError::Internal)?, menu_id).cloned())
        })
    }

    fn create<'a>(&'a self, input: MenuCreateRecord) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut roots = self.roots.lock().map_err(|_| AppError::Internal)?;
            let mut next_id = self.next_id.lock().map_err(|_| AppError::Internal)?;
            if *next_id <= 0 {
                *next_id = max_menu_id(&roots) + 1;
            }

            let node = MenuNode {
                id: *next_id,
                name: input.name,
                menu_type: input.menu_type,
                url: input.url,
                icon: input.icon,
                sort: input.sort,
                parent_id: input.parent_id,
                children: Vec::new(),
            };
            *next_id += 1;

            if let Some(parent_id) = node.parent_id {
                let parent = find_menu_mut(&mut roots, parent_id)
                    .ok_or_else(|| AppError::NotFound(format!("menu {parent_id}")))?;
                parent.children.push(node);
            } else {
                roots.push(node);
            }
            Ok(())
        })
    }

    fn update<'a>(
        &'a self,
        menu_id: i64,
        input: MenuCreateRecord,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut roots = self.roots.lock().map_err(|_| AppError::Internal)?;
            let mut node = remove_menu_node(&mut roots, menu_id)
                .ok_or_else(|| AppError::NotFound(format!("menu {menu_id}")))?;
            node.name = input.name;
            node.menu_type = input.menu_type;
            node.url = input.url;
            node.icon = input.icon;
            node.sort = input.sort;
            node.parent_id = input.parent_id;

            if let Some(parent_id) = node.parent_id {
                let parent = find_menu_mut(&mut roots, parent_id)
                    .ok_or_else(|| AppError::NotFound(format!("menu {parent_id}")))?;
                parent.children.push(node);
            } else {
                roots.push(node);
            }
            Ok(())
        })
    }

    fn remove<'a>(&'a self, menu_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut roots = self.roots.lock().map_err(|_| AppError::Internal)?;
            remove_menu_node(&mut roots, menu_id)
                .ok_or_else(|| AppError::NotFound(format!("menu {menu_id}")))?;
            self.role_permissions
                .lock()
                .map_err(|_| AppError::Internal)?
                .values_mut()
                .for_each(|menu_ids| menu_ids.retain(|id| *id != menu_id));
            Ok(())
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

fn collect_menu_ids(nodes: &[MenuNode]) -> Vec<i64> {
    nodes
        .iter()
        .flat_map(|node| std::iter::once(node.id).chain(collect_menu_ids(&node.children)))
        .collect()
}

fn normalize_menu(input: MenuMutationRequest) -> AppResult<MenuCreateRecord> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(AppError::Validation("菜单名称不能为空".to_owned()));
    }

    let parent_id = input
        .parent_id
        .or(input.legacy_parent_id)
        .filter(|parent_id| *parent_id > 0);
    let menu_type = input
        .menu_type
        .unwrap_or_else(|| if parent_id.is_some() { 2 } else { 1 });
    if !matches!(menu_type, 1 | 2) {
        return Err(AppError::Validation("菜单类型必须是1或2".to_owned()));
    }
    if menu_type == 2 && parent_id.is_none() {
        return Err(AppError::Validation("子菜单父级不能为空".to_owned()));
    }

    Ok(MenuCreateRecord {
        name: name.to_owned(),
        menu_type,
        url: normalize_optional_text(input.url),
        icon: normalize_optional_text(input.icon),
        sort: input.sort.unwrap_or(0),
        parent_id: if menu_type == 1 { None } else { parent_id },
    })
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let value = value.trim();
        (!value.is_empty()).then(|| value.to_owned())
    })
}

fn find_menu_mut(nodes: &mut [MenuNode], menu_id: i64) -> Option<&mut MenuNode> {
    for node in nodes {
        if node.id == menu_id {
            return Some(node);
        }
        if let Some(found) = find_menu_mut(&mut node.children, menu_id) {
            return Some(found);
        }
    }
    None
}

fn find_menu(nodes: &[MenuNode], menu_id: i64) -> Option<&MenuNode> {
    for node in nodes {
        if node.id == menu_id {
            return Some(node);
        }
        if let Some(found) = find_menu(&node.children, menu_id) {
            return Some(found);
        }
    }
    None
}

fn has_descendant_id(node: &MenuNode, menu_id: i64) -> bool {
    node.children
        .iter()
        .any(|child| child.id == menu_id || has_descendant_id(child, menu_id))
}

fn remove_menu_node(nodes: &mut Vec<MenuNode>, menu_id: i64) -> Option<MenuNode> {
    if let Some(index) = nodes.iter().position(|node| node.id == menu_id) {
        return Some(nodes.remove(index));
    }
    for node in nodes {
        if let Some(found) = remove_menu_node(&mut node.children, menu_id) {
            return Some(found);
        }
    }
    None
}

fn max_menu_id(nodes: &[MenuNode]) -> i64 {
    nodes
        .iter()
        .map(|node| node.id.max(max_menu_id(&node.children)))
        .max()
        .unwrap_or(0)
}

fn sort_menu_tree(nodes: &mut [MenuNode]) {
    nodes.sort_by_key(|node| (node.sort, node.id));
    for node in nodes {
        sort_menu_tree(&mut node.children);
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        dto::MenuMutationRequest,
        services::{development_menu_service, MenuService},
    };

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
    async fn super_admin_role_menu_tree_returns_all_registered_menus() {
        let service = development_menu_service();

        let menus = service
            .role_menu_tree(1)
            .await
            .expect("role menus should load");

        assert!(menus.iter().any(|menu| menu.name == "订单管理"));
        assert!(menus.iter().any(|menu| menu.name == "系统设置"));
    }

    #[tokio::test]
    async fn full_menu_tree_keeps_old_chilren_typo_for_compatibility() {
        let service = development_menu_service();

        let menus = service.menu_tree().await.expect("menu tree should load");

        assert_eq!(menus[1].name, "订单管理");
        assert_eq!(menus[1].legacy_children[0].name, "运单列表");
        assert_eq!(
            menus[1].legacy_children[0].legacy_parent_id,
            Some(menus[1].id)
        );
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
        assert!(response.menu_ids.contains(&31));
    }

    #[tokio::test]
    async fn menu_create_accepts_legacy_parent_field_and_updates_tree() {
        let service = development_menu_service();

        service
            .create(MenuMutationRequest {
                name: " 菜单管理 ".to_owned(),
                menu_type: None,
                url: Some(" /main/system/menu ".to_owned()),
                icon: Some(" settings ".to_owned()),
                sort: Some(2),
                parent_id: None,
                legacy_parent_id: Some(3),
                children: Vec::new(),
                legacy_children: Vec::new(),
            })
            .await
            .expect("menu should create");

        let menus = service.menu_tree().await.expect("menu tree should load");
        let settings = menus
            .iter()
            .find(|menu| menu.name == "系统设置")
            .expect("settings root should exist");
        let created = settings
            .legacy_children
            .iter()
            .find(|menu| menu.name == "菜单管理")
            .expect("created child should appear");

        assert_eq!(created.parent_id, Some(3));
        assert_eq!(created.url.as_deref(), Some("/main/system/menu"));
        assert_eq!(created.icon.as_deref(), Some("settings"));
    }

    #[tokio::test]
    async fn menu_detail_update_and_delete_keep_legacy_shapes() {
        let service = development_menu_service();

        let detail = service
            .detail(31)
            .await
            .expect("menu detail should load")
            .expect("seeded menu should exist");
        assert_eq!(detail.name, "用户管理");
        assert_eq!(detail.parent_id, Some(3));
        assert_eq!(detail.legacy_parent_id, None);

        service
            .update(
                31,
                MenuMutationRequest {
                    name: " 账号管理 ".to_owned(),
                    menu_type: Some(2),
                    url: Some(" /main/system/accounts ".to_owned()),
                    icon: Some(" users ".to_owned()),
                    sort: Some(4),
                    parent_id: Some(3),
                    legacy_parent_id: None,
                    children: Vec::new(),
                    legacy_children: Vec::new(),
                },
            )
            .await
            .expect("menu should update");
        let updated = service
            .detail(31)
            .await
            .expect("menu detail should load")
            .expect("updated menu should exist");
        assert_eq!(updated.name, "账号管理");
        assert_eq!(updated.url.as_deref(), Some("/main/system/accounts"));
        assert_eq!(updated.icon.as_deref(), Some("users"));

        service.remove(31).await.expect("leaf menu should delete");
        assert!(service
            .detail(31)
            .await
            .expect("menu detail should load")
            .is_none());
        assert!(!service
            .role_menu_ids(1)
            .await
            .expect("role menu ids should load")
            .menu_ids
            .contains(&31));
    }

    #[tokio::test]
    async fn menu_update_and_delete_reject_unsafe_parent_operations() {
        let service = development_menu_service();

        let parent_to_child = service
            .update(
                3,
                MenuMutationRequest {
                    name: "系统设置".to_owned(),
                    menu_type: Some(2),
                    url: Some("/main/settings".to_owned()),
                    icon: None,
                    sort: Some(3),
                    parent_id: Some(31),
                    legacy_parent_id: None,
                    children: Vec::new(),
                    legacy_children: Vec::new(),
                },
            )
            .await
            .expect_err("parent menu should not become a child menu");
        assert_eq!(
            parent_to_child.to_string(),
            "请求参数错误: 父级菜单不能修改为子菜单"
        );

        let self_parent = service
            .update(
                31,
                MenuMutationRequest {
                    name: "用户管理".to_owned(),
                    menu_type: Some(2),
                    url: Some("/main/system/user".to_owned()),
                    icon: None,
                    sort: Some(1),
                    parent_id: Some(31),
                    legacy_parent_id: None,
                    children: Vec::new(),
                    legacy_children: Vec::new(),
                },
            )
            .await
            .expect_err("menu should not select itself as parent");
        assert_eq!(
            self_parent.to_string(),
            "请求参数错误: 父级菜单不能选择自身"
        );

        let delete_parent = service
            .remove(3)
            .await
            .expect_err("parent menu should not delete while it has children");
        assert_eq!(
            delete_parent.to_string(),
            "请求参数错误: 存在子菜单，不能删除"
        );
    }
}

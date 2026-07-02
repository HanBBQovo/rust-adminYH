use std::{env, sync::Arc};

use admin_core::{
    dto::{MenuMutationRequest, RoleAssignRequest, RoleListRequest, RoleMutationRequest},
    services::{CompatMenuService, CompatRoleService, MenuService, RoleService},
    AppError,
};
use admin_db::{
    migrations,
    repositories::{MySqlMenuRepository, MySqlRoleRepository},
};
use sqlx::{MySqlPool, Row};
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_role_repository_lists_filters_and_mutates_roles() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlRoleRepository::new(pool.clone());
    let service = CompatRoleService::new(Arc::new(repository));

    let first = scope.seed_role("调度", "核心调度权限").await;
    let second = scope.seed_role("财务", "财务只读权限").await;

    let response = service
        .list(RoleListRequest {
            offset: 0,
            size: 10,
            name: Some(scope.name("调度")),
            intro: Some("核心".to_owned()),
            create_at: None,
        })
        .await
        .expect("roles should list through SQLx repository");
    assert_eq!(response.total_count, 1);
    assert_eq!(response.list[0].id, first);

    let created_name = scope.name("新角色");
    service
        .create(RoleMutationRequest {
            name: format!("  {created_name}  "),
            intro: "  新角色权限  ".to_owned(),
        })
        .await
        .expect("role should create through SQLx repository");
    let created_id = scope
        .role_id_by_name(&created_name)
        .await
        .expect("created role should exist");

    service
        .update(
            created_id,
            RoleMutationRequest {
                name: scope.name("改名角色"),
                intro: "改名权限".to_owned(),
            },
        )
        .await
        .expect("role should update through SQLx repository");
    let updated = service
        .detail(created_id)
        .await
        .expect("role detail should load")
        .expect("updated role should exist");
    assert_eq!(updated.name, scope.name("改名角色"));
    assert_eq!(updated.intro, "改名权限");

    service
        .remove(second)
        .await
        .expect("role should delete through SQLx repository");
    assert!(service
        .detail(second)
        .await
        .expect("removed role detail should load")
        .is_none());

    let missing = service.remove(second).await;
    assert!(matches!(missing, Err(AppError::NotFound(_))));

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_role_repository_lists_without_filters() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlRoleRepository::new(pool.clone());
    let service = CompatRoleService::new(Arc::new(repository));

    let first = scope.seed_role("空筛选A", "空筛选权限A").await;
    let second = scope.seed_role("空筛选B", "空筛选权限B").await;

    let response = service
        .list(RoleListRequest {
            offset: 0,
            size: 50,
            name: None,
            intro: None,
            create_at: None,
        })
        .await
        .expect("empty role filters must not generate dangling WHERE SQL");

    assert!(response.list.iter().any(|role| role.id == first));
    assert!(response.list.iter().any(|role| role.id == second));
    assert!(
        response.total_count >= response.list.len(),
        "unfiltered role count should load alongside the list"
    );

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_menu_repository_builds_legacy_trees_and_creates_children() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let menu_repository = MySqlMenuRepository::new(pool.clone());
    let service = CompatMenuService::new(Arc::new(menu_repository));

    let root_id = scope
        .seed_permission(None, "系统设置", 1, "/main/system", 20)
        .await;
    let child_id = scope
        .seed_permission(Some(root_id), "用户管理", 2, "/main/system/user", 1)
        .await;
    let hidden_other = scope
        .seed_permission(Some(root_id), "未授权菜单", 2, "/main/system/hidden", 2)
        .await;
    let role_id = scope.seed_role("菜单角色", "菜单权限").await;
    scope
        .assign_permissions(role_id, &[root_id, child_id, child_id])
        .await;

    let all_menus = service
        .menu_tree()
        .await
        .expect("full menu tree should load");
    let root = all_menus
        .iter()
        .find(|menu| menu.id == root_id)
        .expect("seeded root should appear");
    assert!(root.children.is_empty());
    assert_eq!(root.legacy_children[0].id, child_id);
    assert!(root
        .legacy_children
        .iter()
        .any(|menu| menu.id == hidden_other));

    let role_menus = service
        .role_menu_tree(role_id)
        .await
        .expect("role menu tree should load");
    let role_root = role_menus
        .iter()
        .find(|menu| menu.id == root_id)
        .expect("authorized root should appear");
    assert_eq!(role_root.children.len(), 1);
    assert_eq!(role_root.children[0].id, child_id);
    assert_eq!(role_root.children[0].legacy_parent_id, Some(root_id));
    assert!(!role_root
        .children
        .iter()
        .any(|menu| menu.id == hidden_other));

    service
        .create(MenuMutationRequest {
            name: format!("  {}  ", scope.name("新增子菜单")),
            menu_type: None,
            url: Some(" /main/system/new ".to_owned()),
            icon: Some(" settings ".to_owned()),
            sort: Some(3),
            parent_id: None,
            legacy_parent_id: Some(root_id),
            children: Vec::new(),
            legacy_children: Vec::new(),
        })
        .await
        .expect("menu should create through SQLx repository");
    let created = scope
        .permission_by_name(&scope.name("新增子菜单"))
        .await
        .expect("created permission should exist");
    assert_eq!(created.parent_id, Some(root_id));
    assert_eq!(created.menu_type, 2);
    assert_eq!(created.url.as_deref(), Some("/main/system/new"));
    assert_eq!(created.icon.as_deref(), Some("settings"));

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_role_assignment_replaces_menu_ids_transactionally() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let role_repository = MySqlRoleRepository::new(pool.clone());
    let menu_repository = MySqlMenuRepository::new(pool.clone());
    let role_service = CompatRoleService::new(Arc::new(role_repository));
    let menu_service = CompatMenuService::new(Arc::new(menu_repository));

    let role_id = scope.seed_role("分配角色", "分配权限").await;
    let root_id = scope
        .seed_permission(None, "订单管理", 1, "/main/order", 1)
        .await;
    let first_child = scope
        .seed_permission(Some(root_id), "运单列表", 2, "/main/order/list", 1)
        .await;
    let second_child = scope
        .seed_permission(Some(root_id), "回单管理", 2, "/main/order/receipt", 2)
        .await;
    scope
        .assign_permissions(role_id, &[root_id, first_child])
        .await;

    role_service
        .assign(RoleAssignRequest {
            role_id,
            menu_list: vec![root_id, second_child, second_child],
        })
        .await
        .expect("role assignment should replace old permissions");

    let assigned = menu_service
        .role_menu_ids(role_id)
        .await
        .expect("role menu ids should load");
    assert_eq!(assigned.id, role_id);
    assert_eq!(assigned.name, scope.name("分配角色"));
    assert_eq!(assigned.menu_ids, vec![root_id, second_child]);
    assert_eq!(scope.role_permission_count(role_id, first_child).await, 0);
    assert_eq!(scope.role_permission_count(role_id, second_child).await, 1);

    let before = menu_service
        .role_menu_ids(role_id)
        .await
        .expect("role menu ids should load before failed assign")
        .menu_ids;
    let error = role_service
        .assign(RoleAssignRequest {
            role_id,
            menu_list: vec![root_id, 999_999_999],
        })
        .await
        .expect_err("unknown permission should fail before replacing existing permissions");
    assert_eq!(error.to_string(), "请求参数错误: 权限菜单不存在: 999999999");
    assert_eq!(
        menu_service
            .role_menu_ids(role_id)
            .await
            .expect("role menu ids should load after failed assign")
            .menu_ids,
        before,
        "failed validation must not clear existing role permissions"
    );

    scope.cleanup().await;
}

async fn test_pool() -> Option<MySqlPool> {
    if env::var("RUN_DB_TESTS").ok().as_deref() != Some("true") {
        eprintln!("SKIP: RUN_DB_TESTS=true 未设置，跳过真实 MySQL 角色/菜单仓储测试。");
        return None;
    }
    let url = env::var("ADMIN_DB_TEST_DATABASE_URL")
        .expect("RUN_DB_TESTS=true 需要 ADMIN_DB_TEST_DATABASE_URL");
    let pool = MySqlPool::connect(&url)
        .await
        .expect("ADMIN_DB_TEST_DATABASE_URL should connect");
    migrations::run(&pool)
        .await
        .expect("compat schema migration should run");
    Some(pool)
}

struct TestScope<'a> {
    pool: &'a MySqlPool,
    prefix: String,
}

impl<'a> TestScope<'a> {
    async fn new(pool: &'a MySqlPool) -> Self {
        let prefix = format!("role_menu_{}", Uuid::new_v4().simple());
        let scope = Self { pool, prefix };
        scope.cleanup().await;
        scope
    }

    fn name(&self, suffix: &str) -> String {
        format!("{}-{suffix}", self.prefix)
    }

    async fn seed_role(&self, suffix: &str, intro: &str) -> i64 {
        let result = sqlx::query("INSERT INTO `role` (`name`, `intro`) VALUES (?, ?)")
            .bind(self.name(suffix))
            .bind(intro)
            .execute(self.pool)
            .await
            .expect("role seed should insert");
        result.last_insert_id() as i64
    }

    async fn seed_permission(
        &self,
        parent_id: Option<i64>,
        suffix: &str,
        menu_type: i32,
        url: &str,
        sort: i32,
    ) -> i64 {
        let result = sqlx::query(
            r#"
            INSERT INTO `permission` (`pid`, `name`, `type`, `url`, `icon`, `sort`)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(parent_id.unwrap_or(0))
        .bind(self.name(suffix))
        .bind(menu_type)
        .bind(url)
        .bind("settings")
        .bind(sort)
        .execute(self.pool)
        .await
        .expect("permission seed should insert");
        result.last_insert_id() as i64
    }

    async fn assign_permissions(&self, role_id: i64, permission_ids: &[i64]) {
        for permission_id in permission_ids {
            sqlx::query("INSERT INTO `role_permission` (`role_id`, `permission_id`) VALUES (?, ?)")
                .bind(role_id)
                .bind(*permission_id)
                .execute(self.pool)
                .await
                .expect("role permission seed should insert");
        }
    }

    async fn role_id_by_name(&self, name: &str) -> Option<i64> {
        sqlx::query("SELECT `id` FROM `role` WHERE `name` = ?")
            .bind(name)
            .fetch_optional(self.pool)
            .await
            .expect("role should query")
            .map(|row| row.try_get("id").expect("role id should exist"))
    }

    async fn permission_by_name(&self, name: &str) -> Option<TestPermission> {
        sqlx::query(
            r#"
            SELECT `pid`, `type`, `url`, `icon`
            FROM `permission`
            WHERE `name` = ?
            "#,
        )
        .bind(name)
        .fetch_optional(self.pool)
        .await
        .expect("permission should query")
        .map(|row| TestPermission {
            parent_id: optional_i64(&row, "pid").filter(|value| *value > 0),
            menu_type: row.try_get("type").expect("type should exist"),
            url: row.try_get("url").expect("url should exist"),
            icon: row.try_get("icon").expect("icon should exist"),
        })
    }

    async fn role_permission_count(&self, role_id: i64, permission_id: i64) -> i64 {
        sqlx::query(
            r#"
            SELECT COUNT(*) AS total
            FROM `role_permission`
            WHERE `role_id` = ? AND `permission_id` = ?
            "#,
        )
        .bind(role_id)
        .bind(permission_id)
        .fetch_one(self.pool)
        .await
        .expect("role permission count should query")
        .try_get("total")
        .expect("total should exist")
    }

    async fn cleanup(&self) {
        sqlx::query(
            r#"
            DELETE rp
            FROM `role_permission` rp
            LEFT JOIN `role` r ON r.`id` = rp.`role_id`
            LEFT JOIN `permission` p ON p.`id` = rp.`permission_id`
            WHERE r.`name` LIKE ? OR p.`name` LIKE ?
            "#,
        )
        .bind(format!("{}-%", self.prefix))
        .bind(format!("{}-%", self.prefix))
        .execute(self.pool)
        .await
        .expect("role permission cleanup should run");

        sqlx::query("DELETE FROM `permission` WHERE `name` LIKE ?")
            .bind(format!("{}-%", self.prefix))
            .execute(self.pool)
            .await
            .expect("permission cleanup should run");

        sqlx::query("DELETE FROM `role` WHERE `name` LIKE ?")
            .bind(format!("{}-%", self.prefix))
            .execute(self.pool)
            .await
            .expect("role cleanup should run");
    }
}

struct TestPermission {
    parent_id: Option<i64>,
    menu_type: i32,
    url: Option<String>,
    icon: Option<String>,
}

fn optional_i64(row: &sqlx::mysql::MySqlRow, column: &str) -> Option<i64> {
    row.try_get::<Option<i64>, _>(column)
        .ok()
        .flatten()
        .or_else(|| row.try_get::<i64, _>(column).ok())
        .or_else(|| {
            row.try_get::<u64, _>(column)
                .ok()
                .and_then(|value| value.try_into().ok())
        })
}

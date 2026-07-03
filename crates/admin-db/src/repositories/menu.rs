use std::collections::HashSet;

use admin_core::{
    domain::MenuNode,
    services::menu::{MenuCreateRecord, MenuStore, RoleSummary, ServiceFuture},
    AppError, AppResult,
};
use sqlx::{MySqlPool, Row};

#[derive(Debug, Clone)]
pub struct MySqlMenuRepository {
    pool: MySqlPool,
}

impl MySqlMenuRepository {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }
}

impl MenuStore for MySqlMenuRepository {
    fn role_summary<'a>(
        &'a self,
        role_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<RoleSummary>>> {
        Box::pin(async move {
            sqlx::query(
                r#"
                SELECT `id`, `name`, COALESCE(`intro`, '') AS `intro`
                FROM `role`
                WHERE `id` = ?
                "#,
            )
            .bind(role_id)
            .map(role_summary_from_row)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)
        })
    }

    fn menu_tree<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<MenuNode>>> {
        Box::pin(async move {
            let items = sqlx::query(
                r#"
                SELECT `id`, `name`, `type`, `url`, `icon`, `sort`, `pid`
                FROM `permission`
                ORDER BY `sort` ASC, `id` ASC
                "#,
            )
            .map(flat_menu_from_row)
            .fetch_all(&self.pool)
            .await
            .map_err(db_error)?;

            Ok(build_menu_tree(&items, None))
        })
    }

    fn find_by_id<'a>(&'a self, menu_id: i64) -> ServiceFuture<'a, AppResult<Option<MenuNode>>> {
        Box::pin(async move {
            sqlx::query(
                r#"
                SELECT `id`, `name`, `type`, `url`, `icon`, `sort`, `pid`
                FROM `permission`
                WHERE `id` = ?
                "#,
            )
            .bind(menu_id)
            .map(flat_menu_from_row)
            .fetch_optional(&self.pool)
            .await
            .map(|item| {
                item.map(|item| MenuNode {
                    id: item.id,
                    name: item.name,
                    menu_type: item.menu_type,
                    url: item.url,
                    icon: item.icon,
                    sort: item.sort,
                    parent_id: item.parent_id,
                    children: Vec::new(),
                })
            })
            .map_err(db_error)
        })
    }

    fn create<'a>(&'a self, input: MenuCreateRecord) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            sqlx::query(
                r#"
                INSERT INTO `permission` (`pid`, `name`, `type`, `url`, `icon`, `sort`)
                VALUES (?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(input.parent_id)
            .bind(input.name)
            .bind(input.menu_type)
            .bind(input.url)
            .bind(input.icon)
            .bind(input.sort)
            .execute(&self.pool)
            .await
            .map(|_| ())
            .map_err(db_error)
        })
    }

    fn update<'a>(
        &'a self,
        menu_id: i64,
        input: MenuCreateRecord,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let result = sqlx::query(
                r#"
                UPDATE `permission`
                SET `pid` = ?, `name` = ?, `type` = ?, `url` = ?, `icon` = ?, `sort` = ?
                WHERE `id` = ?
                "#,
            )
            .bind(input.parent_id)
            .bind(input.name)
            .bind(input.menu_type)
            .bind(input.url)
            .bind(input.icon)
            .bind(input.sort)
            .bind(menu_id)
            .execute(&self.pool)
            .await
            .map_err(db_error)?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound(format!("menu {menu_id}")));
            }
            Ok(())
        })
    }

    fn remove<'a>(&'a self, menu_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(db_error)?;
            let child_count: i64 =
                sqlx::query("SELECT COUNT(*) AS total FROM `permission` WHERE `pid` = ?")
                    .bind(menu_id)
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(db_error)?
                    .try_get("total")
                    .map_err(db_error)?;
            if child_count > 0 {
                return Err(AppError::Validation("存在子菜单，不能删除".to_owned()));
            }

            sqlx::query("DELETE FROM `role_permission` WHERE `permission_id` = ?")
                .bind(menu_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            let result = sqlx::query("DELETE FROM `permission` WHERE `id` = ?")
                .bind(menu_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound(format!("menu {menu_id}")));
            }
            tx.commit().await.map_err(db_error)
        })
    }

    fn menu_ids_for_role<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<Vec<i64>>> {
        Box::pin(async move {
            sqlx::query(
                r#"
                SELECT DISTINCT `permission_id`
                FROM `role_permission`
                WHERE `role_id` = ?
                ORDER BY `permission_id` ASC
                "#,
            )
            .bind(role_id)
            .map(|row: sqlx::mysql::MySqlRow| get_i64(&row, "permission_id"))
            .fetch_all(&self.pool)
            .await
            .map_err(db_error)
        })
    }
}

#[derive(Debug, Clone)]
struct FlatMenu {
    id: i64,
    name: String,
    menu_type: i32,
    url: Option<String>,
    icon: Option<String>,
    sort: i32,
    parent_id: Option<i64>,
}

fn build_menu_tree(items: &[FlatMenu], parent_id: Option<i64>) -> Vec<MenuNode> {
    let mut seen = HashSet::new();
    items
        .iter()
        .filter(|item| match parent_id {
            Some(parent_id) => item.parent_id == Some(parent_id),
            None => item.parent_id.is_none() && item.menu_type == 1,
        })
        .filter(|item| seen.insert(item.id))
        .map(|item| MenuNode {
            id: item.id,
            name: item.name.clone(),
            menu_type: item.menu_type,
            url: item.url.clone(),
            icon: item.icon.clone(),
            sort: item.sort,
            parent_id: item.parent_id,
            children: build_menu_tree(items, Some(item.id)),
        })
        .collect()
}

fn role_summary_from_row(row: sqlx::mysql::MySqlRow) -> RoleSummary {
    RoleSummary {
        id: get_i64(&row, "id"),
        name: get_string(&row, "name"),
        intro: get_string(&row, "intro"),
    }
}

fn flat_menu_from_row(row: sqlx::mysql::MySqlRow) -> FlatMenu {
    FlatMenu {
        id: get_i64(&row, "id"),
        name: get_string(&row, "name"),
        menu_type: get_i32(&row, "type"),
        url: get_nullable_string(&row, "url"),
        icon: get_nullable_string(&row, "icon"),
        sort: get_i32(&row, "sort"),
        parent_id: get_optional_i64(&row, "pid").filter(|value| *value > 0),
    }
}

fn get_nullable_string(row: &sqlx::mysql::MySqlRow, column: &str) -> Option<String> {
    row.try_get::<Option<String>, _>(column).ok().flatten()
}

fn get_string(row: &sqlx::mysql::MySqlRow, column: &str) -> String {
    get_nullable_string(row, column)
        .or_else(|| row.try_get::<String, _>(column).ok())
        .unwrap_or_default()
}

fn get_i32(row: &sqlx::mysql::MySqlRow, column: &str) -> i32 {
    row.try_get::<i32, _>(column)
        .ok()
        .or_else(|| {
            row.try_get::<i64, _>(column)
                .ok()
                .and_then(|value| value.try_into().ok())
        })
        .unwrap_or_default()
}

fn get_i64(row: &sqlx::mysql::MySqlRow, column: &str) -> i64 {
    row.try_get::<i64, _>(column)
        .ok()
        .or_else(|| {
            row.try_get::<u64, _>(column)
                .ok()
                .and_then(|value| value.try_into().ok())
        })
        .unwrap_or_default()
}

fn get_optional_i64(row: &sqlx::mysql::MySqlRow, column: &str) -> Option<i64> {
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

fn db_error(error: sqlx::Error) -> AppError {
    AppError::Database(error.to_string())
}

use std::collections::HashSet;

use admin_core::{
    dto::{RoleListRequest, RoleMutationRequest, RoleRecord},
    services::role::{RoleStore, ServiceFuture},
    AppError, AppResult,
};
use sqlx::{MySql, MySqlPool, QueryBuilder, Row, Transaction};

#[derive(Debug, Clone)]
pub struct MySqlRoleRepository {
    pool: MySqlPool,
}

impl MySqlRoleRepository {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }
}

impl RoleStore for MySqlRoleRepository {
    fn list<'a>(
        &'a self,
        input: &'a RoleListRequest,
    ) -> ServiceFuture<'a, AppResult<Vec<RoleRecord>>> {
        Box::pin(async move {
            let mut query = role_select_builder(input);
            query.push(" ORDER BY `id` ASC LIMIT ");
            query.push_bind(input.size as i64);
            query.push(" OFFSET ");
            query.push_bind(input.offset as i64);

            query
                .build()
                .map(role_from_row)
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)
        })
    }

    fn count<'a>(&'a self, input: &'a RoleListRequest) -> ServiceFuture<'a, AppResult<usize>> {
        Box::pin(async move {
            let mut query = QueryBuilder::new("SELECT COUNT(*) AS total FROM `role`");
            push_role_filters(&mut query, input);
            fetch_count(query, &self.pool).await
        })
    }

    fn find_by_id<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<Option<RoleRecord>>> {
        Box::pin(async move {
            sqlx::query(&role_select_sql(" WHERE `id` = ?"))
                .bind(role_id)
                .map(role_from_row)
                .fetch_optional(&self.pool)
                .await
                .map_err(db_error)
        })
    }

    fn create<'a>(&'a self, input: RoleMutationRequest) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            sqlx::query("INSERT INTO `role` (`name`, `intro`) VALUES (?, ?)")
                .bind(input.name)
                .bind(input.intro)
                .execute(&self.pool)
                .await
                .map(|_| ())
                .map_err(db_error)
        })
    }

    fn update<'a>(
        &'a self,
        role_id: i64,
        input: RoleMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let result = sqlx::query("UPDATE `role` SET `name` = ?, `intro` = ? WHERE `id` = ?")
                .bind(input.name)
                .bind(input.intro)
                .bind(role_id)
                .execute(&self.pool)
                .await
                .map_err(db_error)?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound(format!("role {role_id}")));
            }
            Ok(())
        })
    }

    fn remove<'a>(&'a self, role_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(db_error)?;
            let result = sqlx::query("DELETE FROM `role` WHERE `id` = ?")
                .bind(role_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound(format!("role {role_id}")));
            }
            sqlx::query("DELETE FROM `role_permission` WHERE `role_id` = ?")
                .bind(role_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            tx.commit().await.map_err(db_error)
        })
    }

    fn replace_menu_ids<'a>(
        &'a self,
        role_id: i64,
        menu_ids: Vec<i64>,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(db_error)?;
            ensure_role_exists(&mut tx, role_id).await?;
            sqlx::query("DELETE FROM `role_permission` WHERE `role_id` = ?")
                .bind(role_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            let mut seen = HashSet::new();
            for menu_id in menu_ids.into_iter().filter(|menu_id| seen.insert(*menu_id)) {
                sqlx::query(
                    "INSERT INTO `role_permission` (`role_id`, `permission_id`) VALUES (?, ?)",
                )
                .bind(role_id)
                .bind(menu_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            }
            tx.commit().await.map_err(db_error)
        })
    }

    fn validate_menu_ids<'a>(
        &'a self,
        menu_ids: &'a [i64],
    ) -> ServiceFuture<'a, AppResult<Vec<i64>>> {
        Box::pin(async move {
            if menu_ids.is_empty() {
                return Ok(Vec::new());
            }
            let existing = fetch_existing_permission_ids(&self.pool, menu_ids).await?;
            Ok(menu_ids
                .iter()
                .copied()
                .filter(|menu_id| !existing.contains(menu_id))
                .collect())
        })
    }
}

fn role_select_sql(filter_sql: &str) -> String {
    format!(
        r#"
        SELECT
            `id`,
            `name`,
            COALESCE(`intro`, '') AS `intro`,
            CAST(`createAt` AS CHAR) AS `createAt`,
            CAST(`updateAt` AS CHAR) AS `updateAt`
        FROM `role`
        {filter_sql}
        "#
    )
}

fn role_select_builder(input: &RoleListRequest) -> QueryBuilder<'_, MySql> {
    let mut query = QueryBuilder::new(role_select_sql(""));
    push_role_filters(&mut query, input);
    query
}

fn push_role_filters(query: &mut QueryBuilder<'_, MySql>, input: &RoleListRequest) {
    let mut separated = query.separated(" AND ");
    separated.push_unseparated(" WHERE ");
    push_like(&mut separated, "`name`", input.name.as_deref());
    push_like(&mut separated, "`intro`", input.intro.as_deref());
    push_create_at_filter(&mut separated, input.create_at.as_deref());
}

fn push_like(
    separated: &mut sqlx::query_builder::Separated<'_, '_, MySql, &'static str>,
    column: &'static str,
    value: Option<&str>,
) {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    separated.push(column);
    separated.push(" LIKE ");
    separated.push_bind(format!("%{value}%"));
}

fn push_create_at_filter(
    separated: &mut sqlx::query_builder::Separated<'_, '_, MySql, &'static str>,
    create_at: Option<&[String]>,
) {
    let Some(range) = create_at else {
        return;
    };
    match range {
        [date] if !date.trim().is_empty() => {
            separated.push("DATE(`createAt`) = ");
            separated.push_bind(date.trim().to_owned());
        }
        [start, end] if !start.trim().is_empty() && !end.trim().is_empty() => {
            separated.push("DATE(`createAt`) BETWEEN ");
            separated.push_bind(start.trim().to_owned());
            separated.push(" AND ");
            separated.push_bind(end.trim().to_owned());
        }
        _ => {}
    }
}

async fn fetch_count(mut query: QueryBuilder<'_, MySql>, pool: &MySqlPool) -> AppResult<usize> {
    query
        .build()
        .fetch_one(pool)
        .await
        .map_err(db_error)?
        .try_get::<i64, _>("total")
        .map(|value| value as usize)
        .map_err(db_error)
}

async fn ensure_role_exists(tx: &mut Transaction<'_, MySql>, role_id: i64) -> AppResult<()> {
    let exists = sqlx::query("SELECT `id` FROM `role` WHERE `id` = ?")
        .bind(role_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .is_some();
    if !exists {
        return Err(AppError::NotFound(format!("role {role_id}")));
    }
    Ok(())
}

async fn fetch_existing_permission_ids(
    pool: &MySqlPool,
    menu_ids: &[i64],
) -> AppResult<HashSet<i64>> {
    let mut query = QueryBuilder::new("SELECT `id` FROM `permission` WHERE `id` IN (");
    let mut separated = query.separated(", ");
    for menu_id in menu_ids {
        separated.push_bind(*menu_id);
    }
    separated.push_unseparated(")");

    query
        .build()
        .fetch_all(pool)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(|row| row.try_get::<i64, _>("id").map_err(db_error))
        .collect()
}

fn role_from_row(row: sqlx::mysql::MySqlRow) -> RoleRecord {
    RoleRecord::new(
        get_i64(&row, "id"),
        get_string(&row, "name"),
        get_string(&row, "intro"),
        get_string(&row, "createAt"),
        get_string(&row, "updateAt"),
    )
}

fn get_nullable_string(row: &sqlx::mysql::MySqlRow, column: &str) -> Option<String> {
    row.try_get::<Option<String>, _>(column).ok().flatten()
}

fn get_string(row: &sqlx::mysql::MySqlRow, column: &str) -> String {
    get_nullable_string(row, column)
        .or_else(|| row.try_get::<String, _>(column).ok())
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

fn db_error(error: sqlx::Error) -> AppError {
    AppError::Database(error.to_string())
}

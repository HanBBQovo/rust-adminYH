use admin_core::{AppError, AppResult};
use sqlx::{mysql::MySqlRow, MySql, MySqlPool, QueryBuilder, Row};

pub(super) fn db_error(error: sqlx::Error) -> AppError {
    AppError::Database(error.to_string())
}

pub(super) async fn fetch_count(
    mut query: QueryBuilder<'_, MySql>,
    pool: &MySqlPool,
) -> AppResult<usize> {
    query
        .build()
        .fetch_one(pool)
        .await
        .map_err(db_error)?
        .try_get::<i64, _>("total")
        .map(|value| value as usize)
        .map_err(db_error)
}

pub(super) fn get_nullable_string(row: &MySqlRow, column: &str) -> Option<String> {
    row.try_get::<Option<String>, _>(column).ok().flatten()
}

pub(super) fn get_string(row: &MySqlRow, column: &str) -> String {
    get_nullable_string(row, column)
        .or_else(|| row.try_get::<String, _>(column).ok())
        .unwrap_or_default()
}

pub(super) fn get_i32(row: &MySqlRow, column: &str) -> i32 {
    row.try_get::<i32, _>(column)
        .ok()
        .or_else(|| {
            row.try_get::<i64, _>(column)
                .ok()
                .and_then(|value| value.try_into().ok())
        })
        .unwrap_or_default()
}

pub(super) fn get_i64(row: &MySqlRow, column: &str) -> i64 {
    row.try_get::<i64, _>(column)
        .ok()
        .or_else(|| {
            row.try_get::<u64, _>(column)
                .ok()
                .and_then(|value| value.try_into().ok())
        })
        .unwrap_or_default()
}

pub(super) fn get_optional_i64(row: &MySqlRow, column: &str) -> Option<i64> {
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

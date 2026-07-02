use admin_core::{
    domain::{ChartCompany, ChartOrderMetric},
    services::{
        chart::{ChartSnapshot, ServiceFuture},
        ChartStore,
    },
    AppError, AppResult,
};
use sqlx::{MySqlPool, Row};

#[derive(Debug, Clone)]
pub struct MySqlChartRepository {
    pool: MySqlPool,
}

impl MySqlChartRepository {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }
}

impl ChartStore for MySqlChartRepository {
    fn snapshot<'a>(&'a self) -> ServiceFuture<'a, AppResult<ChartSnapshot>> {
        Box::pin(async move {
            let companies = sqlx::query("SELECT `id`, `name` FROM `company` ORDER BY `id` ASC")
                .map(|row: sqlx::mysql::MySqlRow| {
                    ChartCompany::new(get_i64(&row, "id"), get_string(&row, "name"))
                })
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)?;

            let orders =
                sqlx::query("SELECT `company`, `sumfreight`, `receiptnum` FROM `order_list`")
                    .map(|row: sqlx::mysql::MySqlRow| {
                        ChartOrderMetric::new(
                            get_string(&row, "company"),
                            get_string(&row, "sumfreight"),
                            get_i64(&row, "receiptnum"),
                        )
                    })
                    .fetch_all(&self.pool)
                    .await
                    .map_err(db_error)?;

            let company_orders = sqlx::query("SELECT `com_name` FROM `company_order`")
                .map(|row: sqlx::mysql::MySqlRow| get_string(&row, "com_name"))
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)?;

            let receipt_count = sqlx::query("SELECT COUNT(*) AS total FROM `receipt`")
                .fetch_one(&self.pool)
                .await
                .map_err(db_error)?
                .try_get::<i64, _>("total")
                .map_err(db_error)?;

            Ok(ChartSnapshot {
                companies,
                orders,
                company_orders,
                receipt_count,
            })
        })
    }
}

fn get_string(row: &sqlx::mysql::MySqlRow, column: &str) -> String {
    row.try_get::<String, _>(column).unwrap_or_default()
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

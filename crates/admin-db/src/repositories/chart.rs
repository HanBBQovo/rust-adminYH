use admin_core::{
    domain::{ChartCompany, ChartOrderMetric},
    services::{
        chart::{ChartSnapshot, ServiceFuture},
        ChartStore,
    },
    AppResult,
};
use sqlx::{MySql, MySqlPool, QueryBuilder};

use super::sql::{db_error, fetch_count, get_i64, get_string};

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

            let receipt_count = fetch_count(
                QueryBuilder::<MySql>::new("SELECT COUNT(*) AS total FROM `receipt`"),
                &self.pool,
            )
            .await? as i64;

            Ok(ChartSnapshot {
                companies,
                orders,
                company_orders,
                receipt_count,
            })
        })
    }
}

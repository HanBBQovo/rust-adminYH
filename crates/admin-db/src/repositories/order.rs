use admin_core::{
    domain::{OrderRecord, ReceiptRecord},
    dto::{MemoryRecord, OrderListRequest, ReceiptListRequest},
    services::{
        order::{NormalizedOrderInput, ReceiptStatusChange, ServiceFuture},
        OrderStore,
    },
    AppError, AppResult,
};
use sqlx::{MySql, MySqlPool, QueryBuilder, Row, Transaction};

#[derive(Debug, Clone)]
pub struct MySqlOrderRepository {
    pool: MySqlPool,
}

impl MySqlOrderRepository {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }
}

impl OrderStore for MySqlOrderRepository {
    fn list<'a>(
        &'a self,
        input: &'a OrderListRequest,
    ) -> ServiceFuture<'a, AppResult<Vec<OrderRecord>>> {
        Box::pin(async move {
            let mut query = order_select_builder(input);
            query.push(" ORDER BY `id` DESC LIMIT ");
            query.push_bind(input.size as i64);
            query.push(" OFFSET ");
            query.push_bind(input.offset as i64);

            query
                .build()
                .map(order_from_row)
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)
        })
    }

    fn count<'a>(&'a self, input: &'a OrderListRequest) -> ServiceFuture<'a, AppResult<usize>> {
        Box::pin(async move {
            let mut query = QueryBuilder::new("SELECT COUNT(*) AS total FROM `order_list`");
            push_order_filters(&mut query, input);
            fetch_count(query, &self.pool).await
        })
    }

    fn find_order<'a>(
        &'a self,
        order_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<OrderRecord>>> {
        Box::pin(async move {
            sqlx::query("SELECT * FROM `order_list` WHERE `id` = ?")
                .bind(order_id)
                .map(order_from_row)
                .fetch_optional(&self.pool)
                .await
                .map_err(db_error)
        })
    }

    fn create_order<'a>(&'a self, input: NormalizedOrderInput) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(db_error)?;
            let order_id = insert_order(&mut tx, &input).await?;
            insert_company_order(&mut tx, &input.company, order_id).await?;
            if input.receiptnum > 0 {
                insert_receipt_from_order(&mut tx, &input).await?;
            }
            insert_memory_if_missing(&mut tx, &input.consignee).await?;
            insert_memory_if_missing(&mut tx, &input.consignor).await?;
            tx.commit().await.map_err(db_error)
        })
    }

    fn update_order<'a>(
        &'a self,
        order_id: i64,
        input: NormalizedOrderInput,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(db_error)?;
            update_order_row(&mut tx, order_id, &input).await?;
            upsert_company_order(&mut tx, &input.company, order_id).await?;
            if input.receiptnum > 0 {
                upsert_receipt_from_order(&mut tx, &input).await?;
            }
            insert_memory_if_missing(&mut tx, &input.consignee).await?;
            insert_memory_if_missing(&mut tx, &input.consignor).await?;
            tx.commit().await.map_err(db_error)
        })
    }

    fn remove_order<'a>(&'a self, order_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(db_error)?;
            let oddnumber = sqlx::query("SELECT `oddnumber` FROM `order_list` WHERE `id` = ?")
                .bind(order_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(db_error)?
                .map(|row| get_string(&row, "oddnumber"))
                .ok_or_else(|| AppError::NotFound(format!("order {order_id}")))?;

            sqlx::query("DELETE FROM `company_order` WHERE `order_id` = ?")
                .bind(order_id)
                .execute(tx.as_mut())
                .await
                .map_err(db_error)?;

            let same_oddnumber_count = sqlx::query(
                "SELECT COUNT(*) AS total FROM `order_list` WHERE `oddnumber` = ? AND `id` <> ?",
            )
            .bind(&oddnumber)
            .bind(order_id)
            .fetch_one(tx.as_mut())
            .await
            .map_err(db_error)?
            .try_get::<i64, _>("total")
            .map_err(db_error)?;

            if same_oddnumber_count == 0 {
                sqlx::query("DELETE FROM `receipt` WHERE `oddnumber` = ?")
                    .bind(&oddnumber)
                    .execute(tx.as_mut())
                    .await
                    .map_err(db_error)?;
            }

            sqlx::query("DELETE FROM `order_list` WHERE `id` = ?")
                .bind(order_id)
                .execute(tx.as_mut())
                .await
                .map_err(db_error)?;

            tx.commit().await.map_err(db_error)
        })
    }

    fn list_receipts<'a>(
        &'a self,
        input: &'a ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<Vec<ReceiptRecord>>> {
        Box::pin(async move {
            let mut query = receipt_select_builder(input);
            query.push(" ORDER BY `id` DESC LIMIT ");
            query.push_bind(input.size as i64);
            query.push(" OFFSET ");
            query.push_bind(input.offset as i64);

            query
                .build()
                .map(receipt_from_row)
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)
        })
    }

    fn count_receipts<'a>(
        &'a self,
        input: &'a ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<usize>> {
        Box::pin(async move {
            let mut query = QueryBuilder::new("SELECT COUNT(*) AS total FROM `receipt`");
            push_receipt_filters(&mut query, input);
            fetch_count(query, &self.pool).await
        })
    }

    fn update_receipt_status<'a>(
        &'a self,
        receipt_id: i64,
        input: ReceiptStatusChange,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let (column, value) = match input {
                ReceiptStatusChange::Recovery(value) => ("recoverystate", value),
                ReceiptStatusChange::Issue(value) => ("issuestate", value),
                ReceiptStatusChange::Post(value) => ("poststate", value),
            };
            let sql = format!("UPDATE `receipt` SET `{column}` = ? WHERE `id` = ?");
            let result = sqlx::query(&sql)
                .bind(value)
                .bind(receipt_id)
                .execute(&self.pool)
                .await
                .map_err(db_error)?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound(format!("receipt {receipt_id}")));
            }
            Ok(())
        })
    }

    fn list_memories<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<MemoryRecord>>> {
        Box::pin(async move {
            sqlx::query("SELECT `name` AS value FROM `memory` ORDER BY `id` ASC")
                .map(|row: sqlx::mysql::MySqlRow| MemoryRecord {
                    value: row.try_get::<String, _>("value").unwrap_or_default(),
                })
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)
        })
    }
}

fn order_select_builder(input: &OrderListRequest) -> QueryBuilder<'_, MySql> {
    let mut query = QueryBuilder::new("SELECT * FROM `order_list`");
    push_order_filters(&mut query, input);
    query
}

fn receipt_select_builder(input: &ReceiptListRequest) -> QueryBuilder<'_, MySql> {
    let mut query = QueryBuilder::new("SELECT * FROM `receipt`");
    push_receipt_filters(&mut query, input);
    query
}

fn push_order_filters(query: &mut QueryBuilder<'_, MySql>, input: &OrderListRequest) {
    let mut separated = query.separated(" AND ");
    separated.push_unseparated(" WHERE ");
    push_like(
        &mut separated,
        "`oddnumber`",
        input.oddnumber.as_deref(),
        LikeMode::Contains,
    );
    push_like(
        &mut separated,
        "`consignee`",
        input.consignee.as_deref(),
        LikeMode::Contains,
    );
    push_like(
        &mut separated,
        "`consigneephone`",
        input.consigneephone.as_deref(),
        LikeMode::Contains,
    );
    push_like(
        &mut separated,
        "`number`",
        input.number.as_deref(),
        LikeMode::Prefix,
    );
    push_like(
        &mut separated,
        "`consignor`",
        input.consignor.as_deref(),
        LikeMode::Contains,
    );
    push_like(
        &mut separated,
        "`consignorphone`",
        input.consignorphone.as_deref(),
        LikeMode::Contains,
    );
    push_like(
        &mut separated,
        "`company`",
        input.company.as_deref(),
        LikeMode::Contains,
    );
    push_date_filter(&mut separated, "`billingAt`", input.create_at.as_deref());
}

fn push_receipt_filters(query: &mut QueryBuilder<'_, MySql>, input: &ReceiptListRequest) {
    let mut separated = query.separated(" AND ");
    separated.push_unseparated(" WHERE ");
    push_like(
        &mut separated,
        "`oddnumber`",
        input.oddnumber.as_deref(),
        LikeMode::Contains,
    );
    push_like(
        &mut separated,
        "`consignee`",
        input.consignee.as_deref(),
        LikeMode::Contains,
    );
    push_like(
        &mut separated,
        "`consignor`",
        input.consignor.as_deref(),
        LikeMode::Contains,
    );
    push_like(
        &mut separated,
        "`recoverystate`",
        input.recoverystate.as_deref(),
        LikeMode::Contains,
    );
    push_like(
        &mut separated,
        "`issuestate`",
        input.issuestate.as_deref(),
        LikeMode::Contains,
    );
    push_like(
        &mut separated,
        "`poststate`",
        input.poststate.as_deref(),
        LikeMode::Contains,
    );
    push_date_filter(&mut separated, "`billingAt`", input.create_at.as_deref());
}

enum LikeMode {
    Contains,
    Prefix,
}

fn push_like<'a>(
    separated: &mut sqlx::query_builder::Separated<'_, 'a, MySql, &'static str>,
    column: &str,
    value: Option<&str>,
    mode: LikeMode,
) {
    let value = value.unwrap_or_default();
    separated.push(format!("{column} LIKE "));
    match mode {
        LikeMode::Contains => separated.push_bind(format!("%{value}%")),
        LikeMode::Prefix => separated.push_bind(format!("{value}%")),
    };
}

fn push_date_filter<'a>(
    separated: &mut sqlx::query_builder::Separated<'_, 'a, MySql, &'static str>,
    column: &str,
    dates: Option<&[admin_core::dto::LegacyDateInput]>,
) {
    let Some(dates) = dates else {
        return;
    };
    match dates {
        [start, end, ..] => {
            separated.push(format!("{column} BETWEEN "));
            separated.push_bind(start.as_legacy_millis());
            separated.push(" AND ");
            separated.push_bind(end.as_legacy_millis());
        }
        [start] => {
            separated.push(format!("{column} = "));
            separated.push_bind(start.as_legacy_millis());
        }
        [] => {}
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

async fn insert_order(
    tx: &mut Transaction<'_, MySql>,
    input: &NormalizedOrderInput,
) -> AppResult<i64> {
    let result = sqlx::query(
        r#"
        INSERT INTO `order_list` (
            `oddnumber`, `billingAt`, `consignee`, `consigneephone`, `address`, `method`,
            `goodsname`, `number`, `pack`, `weight`, `measurement`, `cainsurance`, `value`,
            `insurance`, `consignor`, `consignorphone`, `freight`, `delivery`, `sumfreight`,
            `freightstate`, `paynow`, `paygo`, `payback`, `paymonth`, `receiptnum`, `company`, `remarks`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind_order(input)
    .execute(tx.as_mut())
    .await
    .map_err(db_error)?;
    Ok(result.last_insert_id() as i64)
}

async fn update_order_row(
    tx: &mut Transaction<'_, MySql>,
    order_id: i64,
    input: &NormalizedOrderInput,
) -> AppResult<()> {
    let result = sqlx::query(
        r#"
        UPDATE `order_list`
        SET `oddnumber` = ?, `billingAt` = ?, `consignee` = ?, `consigneephone` = ?,
            `address` = ?, `method` = ?, `goodsname` = ?, `number` = ?, `pack` = ?, `weight` = ?,
            `measurement` = ?, `cainsurance` = ?, `value` = ?, `insurance` = ?, `consignor` = ?,
            `consignorphone` = ?, `freight` = ?, `delivery` = ?, `sumfreight` = ?, `freightstate` = ?,
            `paynow` = ?, `paygo` = ?, `payback` = ?, `paymonth` = ?, `receiptnum` = ?,
            `company` = ?, `remarks` = ?
        WHERE `id` = ?
        "#,
    )
    .bind_order(input)
    .bind(order_id)
    .execute(tx.as_mut())
    .await
    .map_err(db_error)?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("order {order_id}")));
    }
    Ok(())
}

trait BindOrder<'q> {
    fn bind_order(
        self,
        input: &'q NormalizedOrderInput,
    ) -> sqlx::query::Query<'q, MySql, sqlx::mysql::MySqlArguments>;
}

impl<'q> BindOrder<'q> for sqlx::query::Query<'q, MySql, sqlx::mysql::MySqlArguments> {
    fn bind_order(
        self,
        input: &'q NormalizedOrderInput,
    ) -> sqlx::query::Query<'q, MySql, sqlx::mysql::MySqlArguments> {
        self.bind(&input.oddnumber)
            .bind(input.billing_at)
            .bind(&input.consignee)
            .bind(&input.consigneephone)
            .bind(&input.address)
            .bind(&input.method)
            .bind(&input.goodsname)
            .bind(&input.number)
            .bind(&input.pack)
            .bind(&input.weight)
            .bind(&input.measurement)
            .bind(&input.cainsurance)
            .bind(&input.value)
            .bind(&input.insurance)
            .bind(&input.consignor)
            .bind(&input.consignorphone)
            .bind(&input.freight)
            .bind(&input.delivery)
            .bind(&input.sumfreight)
            .bind(&input.freightstate)
            .bind(&input.paynow)
            .bind(&input.paygo)
            .bind(&input.payback)
            .bind(&input.paymonth)
            .bind(input.receiptnum)
            .bind(&input.company)
            .bind(&input.remarks)
    }
}

async fn insert_company_order(
    tx: &mut Transaction<'_, MySql>,
    company: &str,
    order_id: i64,
) -> AppResult<()> {
    sqlx::query("INSERT INTO `company_order` (`com_name`, `order_id`) VALUES (?, ?)")
        .bind(company)
        .bind(order_id)
        .execute(tx.as_mut())
        .await
        .map(|_| ())
        .map_err(db_error)
}

async fn upsert_company_order(
    tx: &mut Transaction<'_, MySql>,
    company: &str,
    order_id: i64,
) -> AppResult<()> {
    let result = sqlx::query("UPDATE `company_order` SET `com_name` = ? WHERE `order_id` = ?")
        .bind(company)
        .bind(order_id)
        .execute(tx.as_mut())
        .await
        .map_err(db_error)?;
    if result.rows_affected() == 0 {
        insert_company_order(tx, company, order_id).await?;
    }
    Ok(())
}

async fn insert_receipt_from_order(
    tx: &mut Transaction<'_, MySql>,
    input: &NormalizedOrderInput,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO `receipt` (
            `oddnumber`, `billingAt`, `recoverystate`, `issuestate`, `poststate`,
            `recoverynumber`, `consignor`, `consignee`, `goodsname`, `goodsnumber`
        ) VALUES (?, ?, '未回收', '未发放', '未寄出', ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&input.oddnumber)
    .bind(input.billing_at)
    .bind(input.receiptnum)
    .bind(&input.consignor)
    .bind(&input.consignee)
    .bind(&input.goodsname)
    .bind(&input.number)
    .execute(tx.as_mut())
    .await
    .map(|_| ())
    .map_err(db_error)
}

async fn upsert_receipt_from_order(
    tx: &mut Transaction<'_, MySql>,
    input: &NormalizedOrderInput,
) -> AppResult<()> {
    let result = sqlx::query(
        r#"
        UPDATE `receipt`
        SET `oddnumber` = ?, `recoverynumber` = ?, `consignor` = ?,
            `consignee` = ?, `goodsname` = ?, `goodsnumber` = ?
        WHERE `oddnumber` = ?
        "#,
    )
    .bind(&input.oddnumber)
    .bind(input.receiptnum)
    .bind(&input.consignor)
    .bind(&input.consignee)
    .bind(&input.goodsname)
    .bind(&input.number)
    .bind(&input.oddnumber)
    .execute(tx.as_mut())
    .await
    .map_err(db_error)?;
    if result.rows_affected() == 0 {
        insert_receipt_from_order(tx, input).await?;
    }
    Ok(())
}

async fn insert_memory_if_missing(tx: &mut Transaction<'_, MySql>, name: &str) -> AppResult<()> {
    if name.trim().is_empty() {
        return Ok(());
    }
    let exists = sqlx::query("SELECT `id` FROM `memory` WHERE `name` = ? LIMIT 1")
        .bind(name)
        .fetch_optional(tx.as_mut())
        .await
        .map_err(db_error)?
        .is_some();
    if !exists {
        sqlx::query("INSERT INTO `memory` (`name`) VALUES (?)")
            .bind(name)
            .execute(tx.as_mut())
            .await
            .map_err(db_error)?;
    }
    Ok(())
}

fn order_from_row(row: sqlx::mysql::MySqlRow) -> OrderRecord {
    OrderRecord::new(
        get_i64(&row, "id"),
        get_string(&row, "oddnumber"),
        get_i64(&row, "billingAt"),
        get_string(&row, "consignee"),
        get_string(&row, "consigneephone"),
        get_string(&row, "address"),
        get_string(&row, "method"),
        get_string(&row, "goodsname"),
        get_string(&row, "number"),
        get_string(&row, "pack"),
        get_string(&row, "weight"),
        get_string(&row, "measurement"),
        get_string(&row, "cainsurance"),
        get_string(&row, "value"),
        get_string(&row, "insurance"),
        get_string(&row, "consignor"),
        get_string(&row, "consignorphone"),
        get_string(&row, "freight"),
        get_string(&row, "delivery"),
        get_string(&row, "sumfreight"),
        get_string(&row, "freightstate"),
        get_string(&row, "paynow"),
        get_string(&row, "paygo"),
        get_string(&row, "payback"),
        get_string(&row, "paymonth"),
        get_i64(&row, "receiptnum"),
        get_string(&row, "company"),
        get_string(&row, "remarks"),
    )
}

fn receipt_from_row(row: sqlx::mysql::MySqlRow) -> ReceiptRecord {
    ReceiptRecord::new(
        get_i64(&row, "id"),
        get_string(&row, "oddnumber"),
        get_i64(&row, "billingAt"),
        get_string(&row, "recoverystate"),
        get_string(&row, "issuestate"),
        get_string(&row, "poststate"),
        get_i64(&row, "recoverynumber"),
        get_string(&row, "consignor"),
        get_string(&row, "consignee"),
        get_string(&row, "goodsname"),
        get_string(&row, "goodsnumber"),
    )
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

use admin_core::{
    domain::Company,
    services::{company::ServiceFuture, CompanyStore},
    AppError, AppResult,
};
use sqlx::{MySqlPool, Row};

#[derive(Debug, Clone)]
pub struct MySqlCompanyRepository {
    pool: MySqlPool,
}

impl MySqlCompanyRepository {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }
}

impl CompanyStore for MySqlCompanyRepository {
    fn list<'a>(
        &'a self,
        offset: usize,
        size: usize,
    ) -> ServiceFuture<'a, AppResult<Vec<Company>>> {
        Box::pin(async move {
            sqlx::query(
                r#"
                SELECT
                    c.`id`,
                    c.`name`,
                    CAST(c.`createAt` AS CHAR) AS `createAt`,
                    CAST(c.`updateAt` AS CHAR) AS `updateAt`,
                    COUNT(co.`order_id`) AS `Countorder`
                FROM `company` c
                LEFT JOIN `company_order` co ON co.`com_name` = c.`name`
                GROUP BY c.`id`, c.`name`, c.`createAt`, c.`updateAt`
                ORDER BY c.`id` ASC
                LIMIT ? OFFSET ?
                "#,
            )
            .bind(size as i64)
            .bind(offset as i64)
            .map(company_from_row)
            .fetch_all(&self.pool)
            .await
            .map_err(db_error)
        })
    }

    fn count<'a>(&'a self) -> ServiceFuture<'a, AppResult<usize>> {
        Box::pin(async move {
            sqlx::query("SELECT COUNT(*) AS total FROM `company`")
                .fetch_one(&self.pool)
                .await
                .map_err(db_error)?
                .try_get::<i64, _>("total")
                .map(|value| value as usize)
                .map_err(db_error)
        })
    }

    fn detail<'a>(&'a self, company_id: i64) -> ServiceFuture<'a, AppResult<Vec<Company>>> {
        Box::pin(async move {
            sqlx::query(
                r#"
                SELECT
                    c.`id`,
                    c.`name`,
                    CAST(c.`createAt` AS CHAR) AS `createAt`,
                    CAST(c.`updateAt` AS CHAR) AS `updateAt`,
                    COUNT(co.`order_id`) AS `Countorder`
                FROM `company` c
                LEFT JOIN `company_order` co ON co.`com_name` = c.`name`
                WHERE c.`id` = ?
                GROUP BY c.`id`, c.`name`, c.`createAt`, c.`updateAt`
                "#,
            )
            .bind(company_id)
            .map(company_from_row)
            .fetch_all(&self.pool)
            .await
            .map_err(db_error)
        })
    }

    fn create<'a>(&'a self, name: &'a str) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            ensure_unique_name(&self.pool, name, None).await?;
            sqlx::query("INSERT INTO `company` (`name`) VALUES (?)")
                .bind(name)
                .execute(&self.pool)
                .await
                .map(|_| ())
                .map_err(db_error)
        })
    }

    fn update<'a>(&'a self, company_id: i64, name: &'a str) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            ensure_unique_name(&self.pool, name, Some(company_id)).await?;
            let result = sqlx::query("UPDATE `company` SET `name` = ? WHERE `id` = ?")
                .bind(name)
                .bind(company_id)
                .execute(&self.pool)
                .await
                .map_err(db_error)?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound(format!("company {company_id}")));
            }
            Ok(())
        })
    }

    fn remove<'a>(&'a self, company_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let result = sqlx::query("DELETE FROM `company` WHERE `id` = ?")
                .bind(company_id)
                .execute(&self.pool)
                .await
                .map_err(db_error)?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound(format!("company {company_id}")));
            }
            Ok(())
        })
    }
}

async fn ensure_unique_name(
    pool: &MySqlPool,
    name: &str,
    ignore_company_id: Option<i64>,
) -> AppResult<()> {
    let duplicate = if let Some(company_id) = ignore_company_id {
        sqlx::query("SELECT `id` FROM `company` WHERE `name` = ? AND `id` <> ? LIMIT 1")
            .bind(name)
            .bind(company_id)
            .fetch_optional(pool)
            .await
            .map_err(db_error)?
            .is_some()
    } else {
        sqlx::query("SELECT `id` FROM `company` WHERE `name` = ? LIMIT 1")
            .bind(name)
            .fetch_optional(pool)
            .await
            .map_err(db_error)?
            .is_some()
    };

    if duplicate {
        return Err(AppError::Validation("发货公司已存在".to_owned()));
    }
    Ok(())
}

fn company_from_row(row: sqlx::mysql::MySqlRow) -> Company {
    Company::new(
        get_i64(&row, "id"),
        get_string(&row, "name"),
        get_string(&row, "createAt"),
        get_string(&row, "updateAt"),
        get_i64(&row, "Countorder"),
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

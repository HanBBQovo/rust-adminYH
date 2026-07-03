use std::{future::Future, pin::Pin};

use admin_core::{AppError, AppResult};
use sqlx::{MySql, MySqlConnection, MySqlPool, Transaction};

pub type MySqlTransactionFuture<'a, T> = Pin<Box<dyn Future<Output = AppResult<T>> + Send + 'a>>;

pub struct MySqlTransaction<'a> {
    inner: Transaction<'a, MySql>,
    scope: &'static str,
}

impl<'a> MySqlTransaction<'a> {
    fn new(inner: Transaction<'a, MySql>, scope: &'static str) -> Self {
        Self { inner, scope }
    }

    pub fn scope(&self) -> &'static str {
        self.scope
    }
}

impl<'a> AsMut<MySqlConnection> for MySqlTransaction<'a> {
    fn as_mut(&mut self) -> &mut MySqlConnection {
        self.inner.as_mut()
    }
}

pub async fn begin_mysql_transaction<'a>(
    pool: &'a MySqlPool,
    scope: &'static str,
) -> AppResult<MySqlTransaction<'a>> {
    pool.begin()
        .await
        .map(|inner| MySqlTransaction::new(inner, scope))
        .map_err(|error| transaction_error(scope, "begin", error))
}

pub async fn commit_mysql_transaction(tx: MySqlTransaction<'_>) -> AppResult<()> {
    let MySqlTransaction { inner, scope } = tx;
    inner
        .commit()
        .await
        .map_err(|error| transaction_error(scope, "commit", error))
}

pub async fn with_mysql_transaction<'pool, T, F>(
    pool: &'pool MySqlPool,
    scope: &'static str,
    body: F,
) -> AppResult<T>
where
    T: Send + 'pool,
    F: for<'tx> FnOnce(&'tx mut MySqlTransaction<'pool>) -> MySqlTransactionFuture<'tx, T> + Send,
{
    let mut tx = begin_mysql_transaction(pool, scope).await?;
    let result = body(&mut tx).await;
    match result {
        Ok(value) => {
            commit_mysql_transaction(tx).await?;
            Ok(value)
        }
        Err(error) => {
            tracing::warn!(
                transaction.scope = tx.scope(),
                transaction.phase = "rollback_on_drop",
                error = %error,
                "mysql transaction body failed; rollback will happen on drop"
            );
            Err(error)
        }
    }
}

pub fn transaction_sql_error(scope: &str, operation: &str, error: sqlx::Error) -> AppError {
    AppError::Database(format!(
        "transaction {scope} sql {operation} failed: {error}"
    ))
}

fn transaction_error(scope: &str, phase: &str, error: sqlx::Error) -> AppError {
    AppError::Database(format!("transaction {scope} {phase} failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transaction_errors_include_scope_and_phase() {
        let error = transaction_error("order.create", "begin", sqlx::Error::RowNotFound);

        let AppError::Database(message) = error else {
            panic!("expected database error");
        };
        assert!(message.contains("transaction order.create begin failed"));
    }

    #[test]
    fn transaction_errors_include_commit_phase() {
        let error = transaction_error("role.replace_menu_ids", "commit", sqlx::Error::RowNotFound);

        let AppError::Database(message) = error else {
            panic!("expected database error");
        };
        assert!(message.contains("transaction role.replace_menu_ids commit failed"));
    }

    #[test]
    fn transaction_sql_errors_include_scope_and_operation() {
        let error = transaction_sql_error(
            "receipt.batch_status",
            "fetch_existing_ids",
            sqlx::Error::RowNotFound,
        );

        let AppError::Database(message) = error else {
            panic!("expected database error");
        };
        assert!(message.contains("transaction receipt.batch_status sql fetch_existing_ids failed"));
    }
}

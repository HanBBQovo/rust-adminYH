use admin_core::{AppError, AppResult};
use sqlx::{MySql, MySqlPool, Transaction};

pub type MySqlTransaction<'a> = Transaction<'a, MySql>;

pub async fn begin_mysql_transaction<'a>(
    pool: &'a MySqlPool,
    scope: &str,
) -> AppResult<MySqlTransaction<'a>> {
    pool.begin()
        .await
        .map_err(|error| transaction_error(scope, "begin", error))
}

pub async fn commit_mysql_transaction(tx: MySqlTransaction<'_>, scope: &str) -> AppResult<()> {
    tx.commit()
        .await
        .map_err(|error| transaction_error(scope, "commit", error))
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
}

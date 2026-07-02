use std::{env, sync::Arc};

use admin_core::services::{ChartService, CompatChartService};
use admin_db::{migrations, repositories::MySqlChartRepository};
use sqlx::{MySqlPool, Row};
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_chart_repository_keeps_legacy_header_metrics() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let service = CompatChartService::new(Arc::new(MySqlChartRepository::new(pool.clone())));

    let before = service
        .header_list()
        .await
        .expect("baseline header metrics should load");

    let first_company = scope.seed_company("图表公司A").await;
    let second_company = scope.seed_company("图表公司B").await;
    scope
        .seed_order(&first_company.name, "001", "1,200", 2)
        .await;
    scope.seed_order(&first_company.name, "002", "bad", 1).await;
    scope.seed_order(&second_company.name, "003", "30", 0).await;
    scope.seed_receipt("001").await;
    scope.seed_receipt("002").await;

    let after = service
        .header_list()
        .await
        .expect("header metrics should load after scoped seed");

    assert_metric_delta(&before, &after, "ordercount", 3);
    assert_metric_delta(&before, &after, "orderfreight", 1230);
    assert_metric_delta(&before, &after, "companycount", 2);
    assert_metric_delta(&before, &after, "receiptcount", 2);

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_chart_repository_keeps_company_aggregate_legacy_sources() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let service = CompatChartService::new(Arc::new(MySqlChartRepository::new(pool.clone())));

    let first_company = scope.seed_company("聚合公司A").await;
    let second_company = scope.seed_company("聚合公司B").await;
    let first_order = scope.seed_order(&first_company.name, "010", "100", 2).await;
    scope.seed_order(&first_company.name, "011", "250", 3).await;
    scope.seed_order(&second_company.name, "012", "75", 1).await;
    scope
        .seed_company_order(&first_company.name, first_order)
        .await;
    scope
        .seed_company_order(&first_company.name, first_order + 999_000)
        .await;
    scope
        .seed_company_order(&second_company.name, first_order + 999_001)
        .await;

    let counts = service
        .company_order_count()
        .await
        .expect("company order counts should load");
    assert_eq!(order_count_for(&counts, &first_company.name), 2);
    assert_eq!(order_count_for(&counts, &second_company.name), 1);

    let freights = service
        .company_order_sumfreight()
        .await
        .expect("company freight sums should load");
    assert_eq!(freight_for(&freights, &first_company.name), 350);
    assert_eq!(freight_for(&freights, &second_company.name), 75);

    let receipts = service
        .company_receipt_sumreceipt()
        .await
        .expect("company receipt sums should load");
    assert_eq!(receipt_for(&receipts, &first_company.name), 5);
    assert_eq!(receipt_for(&receipts, &second_company.name), 1);

    scope.cleanup().await;
}

async fn test_pool() -> Option<MySqlPool> {
    if env::var("RUN_DB_TESTS").ok().as_deref() != Some("true") {
        eprintln!("SKIP: RUN_DB_TESTS=true 未设置，跳过真实 MySQL 图表仓储测试。");
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

#[derive(Debug, Clone)]
struct TestCompany {
    name: String,
}

struct TestScope<'a> {
    pool: &'a MySqlPool,
    prefix: String,
}

impl<'a> TestScope<'a> {
    async fn new(pool: &'a MySqlPool) -> Self {
        let prefix = format!("chart_{}", Uuid::new_v4().simple());
        let scope = Self { pool, prefix };
        scope.cleanup().await;
        scope
    }

    fn name(&self, suffix: &str) -> String {
        format!("{}-{suffix}", self.prefix)
    }

    fn oddnumber(&self, suffix: &str) -> String {
        format!("{}-{suffix}", self.prefix)
    }

    async fn seed_company(&self, suffix: &str) -> TestCompany {
        let name = self.name(suffix);
        sqlx::query("INSERT INTO `company` (`name`) VALUES (?)")
            .bind(&name)
            .execute(self.pool)
            .await
            .expect("company seed should insert");
        TestCompany { name }
    }

    async fn seed_order(
        &self,
        company_name: &str,
        suffix: &str,
        sumfreight: &str,
        receiptnum: i64,
    ) -> i64 {
        let result = sqlx::query(
            r#"
            INSERT INTO `order_list` (`oddnumber`, `billingAt`, `company`, `sumfreight`, `receiptnum`)
            VALUES (?, 1767225600000, ?, ?, ?)
            "#,
        )
        .bind(self.oddnumber(suffix))
        .bind(company_name)
        .bind(sumfreight)
        .bind(receiptnum)
        .execute(self.pool)
        .await
        .expect("order seed should insert");
        result.last_insert_id() as i64
    }

    async fn seed_company_order(&self, company_name: &str, order_id: i64) {
        sqlx::query("INSERT INTO `company_order` (`com_name`, `order_id`) VALUES (?, ?)")
            .bind(company_name)
            .bind(order_id)
            .execute(self.pool)
            .await
            .expect("company_order seed should insert");
    }

    async fn seed_receipt(&self, suffix: &str) {
        sqlx::query(
            r#"
            INSERT INTO `receipt` (`oddnumber`, `billingAt`, `recoverynumber`)
            VALUES (?, 1767225600000, 1)
            "#,
        )
        .bind(self.oddnumber(suffix))
        .execute(self.pool)
        .await
        .expect("receipt seed should insert");
    }

    async fn cleanup(&self) {
        let order_ids: Vec<i64> =
            sqlx::query("SELECT `id` FROM `order_list` WHERE `oddnumber` LIKE ?")
                .bind(format!("{}-%", self.prefix))
                .fetch_all(self.pool)
                .await
                .expect("scoped order ids should load")
                .into_iter()
                .map(|row| row.try_get("id").expect("id should exist"))
                .collect();

        for order_id in order_ids {
            sqlx::query("DELETE FROM `company_order` WHERE `order_id` = ?")
                .bind(order_id)
                .execute(self.pool)
                .await
                .expect("company_order cleanup should run");
        }

        sqlx::query("DELETE FROM `company_order` WHERE `com_name` LIKE ?")
            .bind(format!("{}-%", self.prefix))
            .execute(self.pool)
            .await
            .expect("company_order text cleanup should run");
        sqlx::query("DELETE FROM `receipt` WHERE `oddnumber` LIKE ?")
            .bind(format!("{}-%", self.prefix))
            .execute(self.pool)
            .await
            .expect("receipt cleanup should run");
        sqlx::query("DELETE FROM `order_list` WHERE `oddnumber` LIKE ?")
            .bind(format!("{}-%", self.prefix))
            .execute(self.pool)
            .await
            .expect("order cleanup should run");
        sqlx::query("DELETE FROM `company` WHERE `name` LIKE ?")
            .bind(format!("{}-%", self.prefix))
            .execute(self.pool)
            .await
            .expect("company cleanup should run");
    }
}

fn assert_metric_delta(
    before: &[admin_core::dto::ChartHeaderItem],
    after: &[admin_core::dto::ChartHeaderItem],
    amount: &str,
    delta: i64,
) {
    let before_metric = before
        .iter()
        .find(|item| item.amount == amount)
        .expect("baseline metric should exist");
    let after_metric = after
        .iter()
        .find(|item| item.amount == amount)
        .expect("updated metric should exist");
    assert_eq!(after_metric.number1 - before_metric.number1, delta);
    assert_eq!(after_metric.number2 - before_metric.number2, delta);
}

fn order_count_for(items: &[admin_core::dto::CompanyOrderCountItem], name: &str) -> i64 {
    items
        .iter()
        .find(|item| item.name == name)
        .expect("company order count should exist")
        .ordercount
}

fn freight_for(items: &[admin_core::dto::CompanyOrderFreightItem], name: &str) -> i64 {
    items
        .iter()
        .find(|item| item.name == name)
        .expect("company freight should exist")
        .sumfreight
}

fn receipt_for(items: &[admin_core::dto::CompanyReceiptSumItem], name: &str) -> i64 {
    items
        .iter()
        .find(|item| item.name == name)
        .expect("company receipt should exist")
        .sum_receipt
}

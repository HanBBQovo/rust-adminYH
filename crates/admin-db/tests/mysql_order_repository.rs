use std::env;

use admin_core::{
    domain::OrderRecord,
    dto::{OrderListRequest, ReceiptListRequest},
    services::{order::NormalizedOrderInput, OrderStore},
};
use admin_db::{migrations, repositories::MySqlOrderRepository};
use sqlx::{MySqlPool, Row};
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_order_repository_create_order_commits_related_rows() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlOrderRepository::new(pool.clone());

    let input = scope.order_input("001", "测试收货人", "测试发货人", 2);
    repository
        .create_order(input)
        .await
        .expect("order should be created");

    let order = scope
        .find_order("001")
        .await
        .expect("created order should exist");
    assert_eq!(order.receiptnum, 2);

    let company_order_count = scope
        .count_by_order_id("company_order", "order_id", order.id)
        .await;
    assert_eq!(company_order_count, 1);

    let receipt_count = scope
        .count_by_text("receipt", "oddnumber", &order.oddnumber)
        .await;
    assert_eq!(receipt_count, 1);

    let memory_count = scope.count_by_text("memory", "name", "测试收货人").await;
    assert_eq!(memory_count, 1);

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_order_repository_update_order_reconciles_receipt() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlOrderRepository::new(pool.clone());

    repository
        .create_order(scope.order_input("010", "原收货人", "原发货人", 1))
        .await
        .expect("order should be created");
    let original_order = scope
        .find_order("010")
        .await
        .expect("created order should exist");

    repository
        .update_order(
            original_order.id,
            scope.order_input("011", "改后收货人", "改后发货人", 3),
        )
        .await
        .expect("order should update");

    assert_eq!(
        scope
            .count_by_text("receipt", "oddnumber", &scope.oddnumber("010"))
            .await,
        0
    );
    let moved_receipt = scope
        .receipt("011")
        .await
        .expect("receipt should move to new oddnumber");
    assert_eq!(moved_receipt.recoverynumber, 3);
    assert_eq!(moved_receipt.consignee, "改后收货人");

    repository
        .update_order(
            original_order.id,
            scope.order_input("011", "改后收货人", "改后发货人", 0),
        )
        .await
        .expect("order should remove receipt when receiptnum is zero");
    assert_eq!(
        scope
            .count_by_text("receipt", "oddnumber", &scope.oddnumber("011"))
            .await,
        0
    );

    repository
        .update_order(
            original_order.id,
            scope.order_input("011", "改后收货人", "改后发货人", 1),
        )
        .await
        .expect("order should recreate receipt when receiptnum becomes positive");
    assert_eq!(
        scope
            .count_by_text("receipt", "oddnumber", &scope.oddnumber("011"))
            .await,
        1
    );

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_order_repository_remove_order_cleans_weak_relations_transactionally() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlOrderRepository::new(pool.clone());

    repository
        .create_order(scope.order_input("020", "删除收货人", "删除发货人", 1))
        .await
        .expect("order should be created");
    let order = scope
        .find_order("020")
        .await
        .expect("created order should exist");

    repository
        .remove_order(order.id)
        .await
        .expect("order should delete");

    assert!(scope.find_order("020").await.is_none());
    assert_eq!(
        scope
            .count_by_order_id("company_order", "order_id", order.id)
            .await,
        0
    );
    assert_eq!(
        scope
            .count_by_text("receipt", "oddnumber", &scope.oddnumber("020"))
            .await,
        0
    );

    let missing = repository.remove_order(order.id).await;
    assert!(matches!(missing, Err(admin_core::AppError::NotFound(_))));

    scope.cleanup().await;
}

async fn test_pool() -> Option<MySqlPool> {
    if env::var("RUN_DB_TESTS").ok().as_deref() != Some("true") {
        eprintln!("SKIP: RUN_DB_TESTS=true 未设置，跳过真实 MySQL 仓储测试。");
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

struct TestScope<'a> {
    pool: &'a MySqlPool,
    prefix: String,
}

impl<'a> TestScope<'a> {
    async fn new(pool: &'a MySqlPool) -> Self {
        let prefix = format!("T{}", Uuid::new_v4().simple());
        let scope = Self { pool, prefix };
        scope.cleanup().await;
        scope
    }

    fn oddnumber(&self, suffix: &str) -> String {
        format!("{}-{suffix}", self.prefix)
    }

    fn order_input(
        &self,
        suffix: &str,
        consignee: &str,
        consignor: &str,
        receiptnum: i64,
    ) -> NormalizedOrderInput {
        NormalizedOrderInput {
            oddnumber: self.oddnumber(suffix),
            billing_at: 1_767_225_600_000,
            consignee: consignee.to_owned(),
            consigneephone: String::new(),
            address: "测试地址".to_owned(),
            method: "送货".to_owned(),
            goodsname: "测试货物".to_owned(),
            number: "2".to_owned(),
            pack: "纸箱".to_owned(),
            weight: "20".to_owned(),
            measurement: "1".to_owned(),
            cainsurance: "否".to_owned(),
            value: String::new(),
            insurance: String::new(),
            consignor: consignor.to_owned(),
            consignorphone: String::new(),
            freight: "100".to_owned(),
            delivery: "20".to_owned(),
            sumfreight: "120".to_owned(),
            freightstate: "现付".to_owned(),
            paynow: "120".to_owned(),
            paygo: String::new(),
            payback: String::new(),
            paymonth: String::new(),
            receiptnum,
            company: format!("{}-公司", self.prefix),
            remarks: String::new(),
        }
    }

    async fn find_order(&self, suffix: &str) -> Option<OrderRecord> {
        let repository = MySqlOrderRepository::new(self.pool.clone());
        repository
            .list(&OrderListRequest {
                offset: 0,
                size: 10,
                oddnumber: Some(self.oddnumber(suffix)),
                consignee: None,
                consigneephone: None,
                number: None,
                consignor: None,
                consignorphone: None,
                company: None,
                create_at: None,
            })
            .await
            .expect("orders should list")
            .into_iter()
            .next()
    }

    async fn receipt(&self, suffix: &str) -> Option<TestReceipt> {
        let repository = MySqlOrderRepository::new(self.pool.clone());
        repository
            .list_receipts(&ReceiptListRequest {
                offset: 0,
                size: 10,
                oddnumber: Some(self.oddnumber(suffix)),
                consignee: None,
                consignor: None,
                recoverystate: None,
                issuestate: None,
                poststate: None,
                create_at: None,
            })
            .await
            .expect("receipts should list")
            .into_iter()
            .next()
            .map(|receipt| TestReceipt {
                recoverynumber: receipt.recoverynumber,
                consignee: receipt.consignee,
            })
    }

    async fn count_by_text(&self, table: &str, column: &str, value: &str) -> i64 {
        let sql = format!("SELECT COUNT(*) AS total FROM `{table}` WHERE `{column}` = ?");
        sqlx::query(&sql)
            .bind(value)
            .fetch_one(self.pool)
            .await
            .expect("count query should run")
            .try_get("total")
            .expect("total should exist")
    }

    async fn count_by_order_id(&self, table: &str, column: &str, value: i64) -> i64 {
        let sql = format!("SELECT COUNT(*) AS total FROM `{table}` WHERE `{column}` = ?");
        sqlx::query(&sql)
            .bind(value)
            .fetch_one(self.pool)
            .await
            .expect("count query should run")
            .try_get("total")
            .expect("total should exist")
    }

    async fn cleanup(&self) {
        let order_ids: Vec<i64> =
            sqlx::query("SELECT `id` FROM `order_list` WHERE `oddnumber` LIKE ?")
                .bind(format!("{}-%", self.prefix))
                .fetch_all(self.pool)
                .await
                .expect("order ids should load")
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
        sqlx::query("DELETE FROM `memory` WHERE `name` IN (?, ?, ?, ?, ?, ?)")
            .bind("测试收货人")
            .bind("测试发货人")
            .bind("原收货人")
            .bind("原发货人")
            .bind("改后收货人")
            .bind("改后发货人")
            .execute(self.pool)
            .await
            .expect("memory cleanup should run");
    }
}

struct TestReceipt {
    recoverynumber: i64,
    consignee: String,
}

use std::env;

use admin_core::{
    domain::OrderRecord,
    dto::{OrderListRequest, ReceiptListRequest},
    services::{
        order::{NormalizedOrderInput, ReceiptStatusChange},
        OrderStore,
    },
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

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_order_repository_treats_sql_injection_filters_as_plain_text() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlOrderRepository::new(pool.clone());

    repository
        .create_order(scope.order_input("030", "注入收货人", "注入发货人", 1))
        .await
        .expect("order should be created");
    repository
        .create_order(scope.order_input("031", "普通收货人", "普通发货人", 1))
        .await
        .expect("second order should be created");

    let payload = format!("{}%' OR 1=1 --", scope.prefix);
    let orders = repository
        .list(&OrderListRequest {
            offset: 0,
            size: 10,
            oddnumber: Some(payload.clone()),
            consignee: Some(payload.clone()),
            consigneephone: None,
            number: None,
            consignor: None,
            consignorphone: None,
            company: Some(payload.clone()),
            create_at: None,
        })
        .await
        .expect("injection-like order filter should stay parameterized");
    let order_count = repository
        .count(&OrderListRequest {
            offset: 0,
            size: 10,
            oddnumber: Some(payload.clone()),
            consignee: Some(payload.clone()),
            consigneephone: None,
            number: None,
            consignor: None,
            consignorphone: None,
            company: Some(payload.clone()),
            create_at: None,
        })
        .await
        .expect("injection-like count filter should stay parameterized");
    assert!(orders.is_empty());
    assert_eq!(order_count, 0);

    let receipts = repository
        .list_receipts(&ReceiptListRequest {
            offset: 0,
            size: 10,
            oddnumber: Some(payload.clone()),
            consignee: Some(payload.clone()),
            consignor: Some(payload.clone()),
            recoverystate: Some("未回收%' OR 1=1 --".to_owned()),
            issuestate: None,
            poststate: None,
            create_at: None,
        })
        .await
        .expect("injection-like receipt filter should stay parameterized");
    let receipt_count = repository
        .count_receipts(&ReceiptListRequest {
            offset: 0,
            size: 10,
            oddnumber: Some(payload),
            consignee: None,
            consignor: None,
            recoverystate: Some("未回收%' OR 1=1 --".to_owned()),
            issuestate: None,
            poststate: None,
            create_at: None,
        })
        .await
        .expect("injection-like receipt count filter should stay parameterized");
    assert!(receipts.is_empty());
    assert_eq!(receipt_count, 0);

    assert!(scope.find_order("030").await.is_some());
    assert!(scope.find_order("031").await.is_some());
    assert_eq!(
        scope
            .count_by_text("receipt", "oddnumber", &scope.oddnumber("030"))
            .await,
        1
    );

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_order_repository_treats_received_and_legacy_issued_as_aliases() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlOrderRepository::new(pool.clone());

    repository
        .create_order(scope.order_input("035", "别名收货人", "别名发货人", 1))
        .await
        .expect("order should be created");
    let receipt = repository
        .list_receipts(&ReceiptListRequest {
            offset: 0,
            size: 10,
            oddnumber: Some(scope.oddnumber("035")),
            consignee: None,
            consignor: None,
            recoverystate: None,
            issuestate: None,
            poststate: None,
            create_at: None,
        })
        .await
        .expect("created receipt should list")
        .into_iter()
        .next()
        .expect("created receipt should exist");

    repository
        .update_receipt_status(receipt.id, ReceiptStatusChange::Issue("已接收".to_owned()))
        .await
        .expect("received issue status should update");
    let legacy_filter = ReceiptListRequest {
        offset: 0,
        size: 10,
        oddnumber: Some(scope.oddnumber("035")),
        consignee: None,
        consignor: None,
        recoverystate: None,
        issuestate: Some("已发放".to_owned()),
        poststate: None,
        create_at: None,
    };
    let list_by_legacy = repository
        .list_receipts(&legacy_filter)
        .await
        .expect("legacy issued filter should include received receipts");
    assert_eq!(list_by_legacy.len(), 1);
    assert_eq!(list_by_legacy[0].issuestate, "已接收");
    assert_eq!(
        repository
            .count_receipts(&legacy_filter)
            .await
            .expect("legacy issued count should include received receipts"),
        1
    );

    repository
        .update_receipt_status(receipt.id, ReceiptStatusChange::Issue("已发放".to_owned()))
        .await
        .expect("legacy issued status should update");
    let received_filter = ReceiptListRequest {
        offset: 0,
        size: 10,
        oddnumber: Some(scope.oddnumber("035")),
        consignee: None,
        consignor: None,
        recoverystate: None,
        issuestate: Some("已接收".to_owned()),
        poststate: None,
        create_at: None,
    };
    let list_by_received = repository
        .list_receipts(&received_filter)
        .await
        .expect("received filter should include legacy issued receipts");
    assert_eq!(list_by_received.len(), 1);
    assert_eq!(list_by_received[0].issuestate, "已发放");
    assert_eq!(
        repository
            .count_receipts(&received_filter)
            .await
            .expect("received count should include legacy issued receipts"),
        1
    );

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_order_repository_batch_receipt_status_updates_transactionally() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlOrderRepository::new(pool.clone());

    let consignee_a = format!("{}-批量收货人A", scope.prefix);
    let consignor_a = format!("{}-批量发货人A", scope.prefix);
    let consignee_b = format!("{}-批量收货人B", scope.prefix);
    let consignor_b = format!("{}-批量发货人B", scope.prefix);
    repository
        .create_order(scope.order_input("036", &consignee_a, &consignor_a, 1))
        .await
        .expect("first order should be created");
    repository
        .create_order(scope.order_input("037", &consignee_b, &consignor_b, 1))
        .await
        .expect("second order should be created");
    let first = scope
        .receipt("036")
        .await
        .expect("first receipt should exist");
    let second = scope
        .receipt("037")
        .await
        .expect("second receipt should exist");

    repository
        .update_receipt_statuses(
            vec![first.id, second.id],
            ReceiptStatusChange::Issue("已接收".to_owned()),
        )
        .await
        .expect("batch issue status should update");
    assert_eq!(
        scope
            .receipt("036")
            .await
            .expect("first receipt should still exist")
            .issuestate,
        "已接收"
    );
    assert_eq!(
        scope
            .receipt("037")
            .await
            .expect("second receipt should still exist")
            .issuestate,
        "已接收"
    );

    let failed = repository
        .update_receipt_statuses(
            vec![first.id, 999_999_999],
            ReceiptStatusChange::Recovery("已回收".to_owned()),
        )
        .await;
    assert!(matches!(failed, Err(admin_core::AppError::NotFound(_))));
    assert_eq!(
        scope
            .receipt("036")
            .await
            .expect("failed batch should not remove receipt")
            .recoverystate,
        "未回收"
    );

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_order_repository_lists_orders_and_receipts_without_filters() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlOrderRepository::new(pool.clone());

    repository
        .create_order(scope.order_input("040", "空筛选收货人A", "空筛选发货人A", 1))
        .await
        .expect("first order should be created");
    repository
        .create_order(scope.order_input("041", "空筛选收货人B", "空筛选发货人B", 1))
        .await
        .expect("second order should be created");

    let orders = repository
        .list(&OrderListRequest {
            offset: 0,
            size: 50,
            oddnumber: None,
            consignee: None,
            consigneephone: None,
            number: None,
            consignor: None,
            consignorphone: None,
            company: None,
            create_at: None,
        })
        .await
        .expect("empty order filters must not generate broad LIKE or dangling WHERE SQL");
    let order_count = repository
        .count(&OrderListRequest {
            offset: 0,
            size: 50,
            oddnumber: None,
            consignee: None,
            consigneephone: None,
            number: None,
            consignor: None,
            consignorphone: None,
            company: None,
            create_at: None,
        })
        .await
        .expect("empty order count filters must not generate invalid SQL");

    assert!(orders
        .iter()
        .any(|order| order.oddnumber == scope.oddnumber("040")));
    assert!(orders
        .iter()
        .any(|order| order.oddnumber == scope.oddnumber("041")));
    assert!(order_count >= orders.len());

    let receipts = repository
        .list_receipts(&ReceiptListRequest {
            offset: 0,
            size: 50,
            oddnumber: None,
            consignee: None,
            consignor: None,
            recoverystate: None,
            issuestate: None,
            poststate: None,
            create_at: None,
        })
        .await
        .expect("empty receipt filters must not generate broad LIKE or dangling WHERE SQL");
    let receipt_count = repository
        .count_receipts(&ReceiptListRequest {
            offset: 0,
            size: 50,
            oddnumber: None,
            consignee: None,
            consignor: None,
            recoverystate: None,
            issuestate: None,
            poststate: None,
            create_at: None,
        })
        .await
        .expect("empty receipt count filters must not generate invalid SQL");

    assert!(receipts
        .iter()
        .any(|receipt| receipt.oddnumber == scope.oddnumber("040")));
    assert!(receipts
        .iter()
        .any(|receipt| receipt.oddnumber == scope.oddnumber("041")));
    assert!(receipt_count >= receipts.len());

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
                id: receipt.id,
                recoverystate: receipt.recoverystate,
                issuestate: receipt.issuestate,
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
        sqlx::query("DELETE FROM `memory` WHERE `name` LIKE ? OR `name` LIKE ?")
            .bind("空筛选收货人%")
            .bind("空筛选发货人%")
            .execute(self.pool)
            .await
            .expect("empty filter memory cleanup should run");
        sqlx::query("DELETE FROM `memory` WHERE `name` LIKE ?")
            .bind(format!("{}-%", self.prefix))
            .execute(self.pool)
            .await
            .expect("scoped memory cleanup should run");
    }
}

struct TestReceipt {
    id: i64,
    recoverystate: String,
    issuestate: String,
    recoverynumber: i64,
    consignee: String,
}

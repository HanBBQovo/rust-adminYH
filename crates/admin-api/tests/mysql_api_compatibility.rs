use std::env;

use admin_api::{build_router, AppConfig, AppServices, AppState};
use admin_core::{auth::legacy_md5_hex, services::StaticHealthService};
use admin_db::{migrations, MySqlPool};
use axum::body::Body;
use http::{header::CONTENT_TYPE, Request, StatusCode};
use serde_json::Value;
use sqlx::Row;
use tower::ServiceExt;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_api_compatibility_uses_real_database_services() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    scope.seed_roles_and_users().await;

    let app = build_router(test_state(pool.clone()));

    let (missing_status, missing_json) = json_request(
        app.clone(),
        "POST",
        "/api/order/list",
        None,
        r#"{"offset":0,"size":1}"#,
    )
    .await;
    assert_eq!(missing_status, StatusCode::UNAUTHORIZED);
    assert_eq!(missing_json["code"], -200);
    assert_eq!(missing_json["message"], "未登录或登录已失效");

    let (login_status, login_json) = json_request(
        app.clone(),
        "POST",
        "/api/login",
        None,
        &format!(
            r#"{{"name":"{}","password":"secret","code":"ignored"}}"#,
            scope.admin_name
        ),
    )
    .await;
    assert_eq!(login_status, StatusCode::OK);
    assert_eq!(login_json["code"], 0);
    assert_eq!(login_json["data"]["name"], scope.admin_name);
    let admin_token = login_json["data"]["token"]
        .as_str()
        .expect("login should return a token")
        .to_owned();
    assert!(admin_token.starts_with("yh-"));
    assert!(
        scope
            .user_password(&scope.admin_name)
            .await
            .starts_with("$argon2"),
        "HTTP login through database services must upgrade old MD5 passwords"
    );

    let (me_status, me_json) =
        json_request(app.clone(), "GET", "/api/users/me", Some(&admin_token), "").await;
    assert_eq!(me_status, StatusCode::OK);
    assert_eq!(me_json["data"]["id"], scope.admin_user_id);
    assert_eq!(me_json["data"]["roleIds"], serde_json::json!([1]));

    let (operator_login_status, operator_login_json) = json_request(
        app.clone(),
        "POST",
        "/api/login",
        None,
        &format!(
            r#"{{"name":"{}","password":"secret"}}"#,
            scope.operator_name
        ),
    )
    .await;
    assert_eq!(operator_login_status, StatusCode::OK);
    let operator_token = operator_login_json["data"]["token"]
        .as_str()
        .expect("operator login should return token")
        .to_owned();

    let (forbidden_status, forbidden_json) = json_request(
        app.clone(),
        "POST",
        "/api/order",
        Some(&operator_token),
        &scope.order_payload("FORBIDDEN"),
    )
    .await;
    assert_eq!(forbidden_status, StatusCode::FORBIDDEN);
    assert_eq!(forbidden_json["code"], -403);
    assert_eq!(forbidden_json["message"], "没有权限执行该操作");

    let (create_status, create_json) = json_request(
        app.clone(),
        "POST",
        "/api/order",
        Some(&admin_token),
        &scope.order_payload("001"),
    )
    .await;
    assert_eq!(create_status, StatusCode::OK);
    assert_eq!(create_json["code"], 0);
    assert_eq!(create_json["message"], "创建订单成功！");

    let (order_status, order_json) = json_request(
        app.clone(),
        "POST",
        "/api/order/list",
        Some(&admin_token),
        &format!(
            r#"{{"offset":0,"size":10,"oddnumber":"{}"}}"#,
            scope.oddnumber("001")
        ),
    )
    .await;
    assert_eq!(order_status, StatusCode::OK);
    assert_eq!(order_json["data"]["totalCount"], 1);
    assert_eq!(
        order_json["data"]["list"][0]["oddnumber"],
        scope.oddnumber("001")
    );
    assert_eq!(order_json["data"]["list"][0]["receiptnum"], 2);

    let order_id = order_json["data"]["list"][0]["id"]
        .as_i64()
        .expect("created order id should be numeric");
    assert_eq!(scope.count_company_order(order_id).await, 1);

    let (receipt_status, receipt_json) = json_request(
        app.clone(),
        "POST",
        "/api/receipt/list",
        Some(&admin_token),
        &format!(
            r#"{{"offset":0,"size":10,"oddnumber":"{}"}}"#,
            scope.oddnumber("001")
        ),
    )
    .await;
    assert_eq!(receipt_status, StatusCode::OK);
    assert_eq!(receipt_json["data"]["totalCount"], 1);
    assert_eq!(
        receipt_json["data"]["list"][0]["oddnumber"],
        scope.oddnumber("001")
    );
    assert_eq!(receipt_json["data"]["list"][0]["recoverynumber"], 2);

    let (memory_status, memory_json) =
        json_request(app, "POST", "/api/memory/list", Some(&admin_token), "{}").await;
    assert_eq!(memory_status, StatusCode::OK);
    assert!(memory_json["code"].is_null());
    assert!(memory_json["message"].is_null());
    let memory_values = memory_json["data"]
        .as_array()
        .expect("memory response should keep old data-only array")
        .iter()
        .filter_map(|item| item["value"].as_str())
        .collect::<Vec<_>>();
    assert!(memory_values.contains(&scope.consignee.as_str()));
    assert!(memory_values.contains(&scope.consignor.as_str()));

    scope.cleanup().await;
}

fn test_state(pool: MySqlPool) -> AppState {
    let mut config = AppConfig::from_env().expect("config should load");
    config.database.url = env::var("ADMIN_DB_TEST_DATABASE_URL")
        .expect("RUN_DB_TESTS=true requires ADMIN_DB_TEST_DATABASE_URL");
    let health_service = StaticHealthService::new("rust-adminYH", env!("CARGO_PKG_VERSION"));
    AppState::with_services(config, AppServices::database(pool, health_service))
}

async fn test_pool() -> Option<MySqlPool> {
    if env::var("RUN_DB_TESTS").ok().as_deref() != Some("true") {
        eprintln!("SKIP: RUN_DB_TESTS=true 未设置，跳过真实 MySQL API 兼容测试。");
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

async fn json_request(
    app: axum::Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    body: &str,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(uri);
    if !body.is_empty() {
        builder = builder.header(CONTENT_TYPE, "application/json");
    }
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }

    let response = app
        .oneshot(
            builder
                .body(Body::from(body.to_owned()))
                .expect("request should build"),
        )
        .await
        .expect("request should succeed");
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body should be readable");
    let json: Value = serde_json::from_slice(&body)
        .unwrap_or_else(|err| panic!("{method} {uri} should return JSON: {err}"));

    (status, json)
}

struct TestScope<'a> {
    pool: &'a MySqlPool,
    prefix: String,
    admin_name: String,
    operator_name: String,
    admin_user_id: i64,
    operator_user_id: i64,
    operator_role_id: i64,
    consignee: String,
    consignor: String,
}

impl<'a> TestScope<'a> {
    async fn new(pool: &'a MySqlPool) -> Self {
        let prefix = format!("API{}", Uuid::new_v4().simple());
        let base_id = next_id(pool, "user").await + 10_000;
        let scope = Self {
            pool,
            admin_name: format!("{prefix}-admin"),
            operator_name: format!("{prefix}-operator"),
            operator_role_id: base_id + 10,
            admin_user_id: base_id,
            operator_user_id: base_id + 1,
            consignee: format!("{prefix}-收货人"),
            consignor: format!("{prefix}-发货人"),
            prefix,
        };
        scope.cleanup().await;
        scope
    }

    async fn seed_roles_and_users(&self) {
        sqlx::query(
            r#"
            INSERT INTO `role` (`id`, `name`, `intro`)
            VALUES (1, '超级管理员', '所有权限')
            ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `intro` = VALUES(`intro`)
            "#,
        )
        .execute(self.pool)
        .await
        .expect("admin role seed should upsert");

        sqlx::query("INSERT INTO `role` (`id`, `name`, `intro`) VALUES (?, ?, ?)")
            .bind(self.operator_role_id)
            .bind(format!("{}-operator-role", self.prefix))
            .bind("真实 MySQL API 测试普通角色")
            .execute(self.pool)
            .await
            .expect("operator role seed should insert");

        self.seed_user(self.admin_user_id, &self.admin_name, 1)
            .await;
        self.seed_user(
            self.operator_user_id,
            &self.operator_name,
            self.operator_role_id,
        )
        .await;
    }

    async fn seed_user(&self, user_id: i64, name: &str, role_id: i64) {
        sqlx::query(
            r#"
            INSERT INTO `user` (`id`, `name`, `password`, `avatar_url`, `enable`, `token`)
            VALUES (?, ?, ?, ?, 1, NULL)
            "#,
        )
        .bind(user_id)
        .bind(name)
        .bind(legacy_md5_hex(b"secret"))
        .bind(format!("/users/{user_id}/avatar"))
        .execute(self.pool)
        .await
        .expect("legacy user seed should insert");

        sqlx::query("INSERT INTO `user_role` (`user_id`, `role_id`) VALUES (?, ?)")
            .bind(user_id)
            .bind(role_id)
            .execute(self.pool)
            .await
            .expect("user role seed should insert");
    }

    fn oddnumber(&self, suffix: &str) -> String {
        format!("{}-{suffix}", self.prefix)
    }

    fn order_payload(&self, suffix: &str) -> String {
        format!(
            r#"{{
                "oddnumber":"{}",
                "billingAt":1767225600000,
                "consignee":"{}",
                "consigneephone":"13800000000",
                "address":"测试地址",
                "method":"送货",
                "goodsname":"测试货物",
                "number":"2",
                "pack":"纸箱",
                "weight":"20",
                "measurement":"1",
                "cainsurance":"否",
                "value":"",
                "insurance":"",
                "consignor":"{}",
                "consignorphone":"13900000000",
                "freight":"100",
                "delivery":"20",
                "sumfreight":"120",
                "freightstate":"现付",
                "paynow":"120",
                "paygo":"",
                "payback":"",
                "paymonth":"",
                "receiptnum":2,
                "company":"{}-发货公司",
                "remarks":"真实 MySQL API 兼容测试"
            }}"#,
            self.oddnumber(suffix),
            self.consignee,
            self.consignor,
            self.prefix
        )
    }

    async fn user_password(&self, name: &str) -> String {
        sqlx::query("SELECT `password` FROM `user` WHERE `name` = ?")
            .bind(name)
            .fetch_one(self.pool)
            .await
            .expect("user password should load")
            .try_get("password")
            .expect("password should exist")
    }

    async fn count_company_order(&self, order_id: i64) -> i64 {
        sqlx::query("SELECT COUNT(*) AS total FROM `company_order` WHERE `order_id` = ?")
            .bind(order_id)
            .fetch_one(self.pool)
            .await
            .expect("company_order count should load")
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
        sqlx::query("DELETE FROM `memory` WHERE `name` IN (?, ?)")
            .bind(&self.consignee)
            .bind(&self.consignor)
            .execute(self.pool)
            .await
            .expect("memory cleanup should run");
        sqlx::query("DELETE FROM `user_role` WHERE `user_id` IN (?, ?) OR `role_id` = ?")
            .bind(self.admin_user_id)
            .bind(self.operator_user_id)
            .bind(self.operator_role_id)
            .execute(self.pool)
            .await
            .expect("user role cleanup should run");
        sqlx::query("DELETE FROM `user` WHERE `id` IN (?, ?) OR `name` IN (?, ?)")
            .bind(self.admin_user_id)
            .bind(self.operator_user_id)
            .bind(&self.admin_name)
            .bind(&self.operator_name)
            .execute(self.pool)
            .await
            .expect("user cleanup should run");
        sqlx::query("DELETE FROM `role` WHERE `id` = ?")
            .bind(self.operator_role_id)
            .execute(self.pool)
            .await
            .expect("operator role cleanup should run");
    }
}

async fn next_id(pool: &MySqlPool, table: &str) -> i64 {
    let sql = format!("SELECT COALESCE(MAX(`id`), 0) + 1000 AS next_id FROM `{table}`");
    sqlx::query(&sql)
        .fetch_one(pool)
        .await
        .expect("next id query should run")
        .try_get("next_id")
        .expect("next id should exist")
}

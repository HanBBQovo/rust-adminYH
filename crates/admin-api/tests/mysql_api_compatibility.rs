use std::{env, path::PathBuf};

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

    let avatar_root = env::temp_dir().join(format!("rust-adminyh-avatar-{}", scope.prefix));
    let avatar_dir = avatar_root.join("avatars");
    tokio::fs::create_dir_all(&avatar_dir)
        .await
        .expect("avatar dir should be created");
    tokio::fs::write(avatar_dir.join("default.jpg"), b"DEFAULT_AVATAR")
        .await
        .expect("default avatar should be written");

    let app = build_router(test_state(pool.clone(), Some(avatar_dir.clone())));

    let (health_status, health_json) =
        json_request(app.clone(), "GET", "/api/health", None, "").await;
    assert_eq!(health_status, StatusCode::OK);
    assert_eq!(health_json["code"], 0);
    assert_eq!(health_json["data"]["service"], "rust-adminYH");
    assert_eq!(health_json["data"]["status"], "ok");
    assert!(health_json["data"]["checks"]
        .as_array()
        .expect("health checks should be an array")
        .iter()
        .any(|check| check["name"] == "database" && check["status"] == "ok"));

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

    let (memory_status, memory_json) = json_request(
        app.clone(),
        "POST",
        "/api/memory/list",
        Some(&admin_token),
        "{}",
    )
    .await;
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

    let (company_forbidden_status, company_forbidden_json) = json_request(
        app.clone(),
        "POST",
        "/api/company",
        Some(&operator_token),
        &format!(r#"{{"name":"{}"}}"#, scope.company_order_name()),
    )
    .await;
    assert_eq!(company_forbidden_status, StatusCode::FORBIDDEN);
    assert_eq!(company_forbidden_json["code"], -403);
    assert_eq!(company_forbidden_json["message"], "没有权限执行该操作");

    let (company_create_status, company_create_json) = json_request(
        app.clone(),
        "POST",
        "/api/company",
        Some(&admin_token),
        &format!(r#"{{"name":"{}"}}"#, scope.company_order_name()),
    )
    .await;
    assert_eq!(company_create_status, StatusCode::OK);
    assert_eq!(company_create_json["code"], 0);
    assert_eq!(company_create_json["message"], "创建发货公司成功！");

    let company_id = scope.company_id_by_name(&scope.company_order_name()).await;
    let company_list_size = scope.table_count("company").await + 10;
    let (company_list_status, company_list_json) = json_request(
        app.clone(),
        "POST",
        "/api/company/list",
        Some(&admin_token),
        &format!(r#"{{"offset":0,"size":{company_list_size}}}"#),
    )
    .await;
    assert_eq!(company_list_status, StatusCode::OK);
    assert_eq!(company_list_json["code"], 0);
    assert_eq!(
        company_list_json["data"]["totalCount"],
        scope.table_count("company").await
    );
    let company_list = company_list_json["data"]["list"]
        .as_array()
        .expect("company list should be an array");
    let created_company = find_company(company_list, company_id);
    assert_eq!(created_company["name"], scope.company_order_name());
    assert_eq!(created_company["Countorder"], 1);
    assert!(created_company["createAt"].is_string());
    assert!(created_company["updateAt"].is_string());

    let (company_detail_status, company_detail_json) = json_request(
        app.clone(),
        "GET",
        &format!("/api/company/{company_id}"),
        Some(&admin_token),
        "",
    )
    .await;
    assert_eq!(company_detail_status, StatusCode::OK);
    assert_eq!(company_detail_json["code"], 0);
    assert_eq!(
        company_detail_json["data"][0]["name"],
        scope.company_order_name()
    );
    assert_eq!(company_detail_json["data"][0]["Countorder"], 1);

    let renamed_company = format!("{}-发货公司-改名", scope.prefix);
    let (company_update_status, company_update_json) = json_request(
        app.clone(),
        "PATCH",
        &format!("/api/company/{company_id}"),
        Some(&admin_token),
        &format!(r#"{{"name":"{renamed_company}"}}"#),
    )
    .await;
    assert_eq!(company_update_status, StatusCode::OK);
    assert_eq!(company_update_json["code"], 0);
    assert_eq!(company_update_json["message"], "修改发货公司成功！");

    let (company_detail_after_update_status, company_detail_after_update_json) = json_request(
        app.clone(),
        "GET",
        &format!("/api/company/{company_id}"),
        Some(&admin_token),
        "",
    )
    .await;
    assert_eq!(company_detail_after_update_status, StatusCode::OK);
    assert_eq!(
        company_detail_after_update_json["data"][0]["name"],
        renamed_company
    );
    assert_eq!(
        company_detail_after_update_json["data"][0]["Countorder"], 0,
        "company rename must keep old weak company_order.com_name text unchanged"
    );
    assert_eq!(
        scope
            .count_company_order_by_name(&scope.company_order_name())
            .await,
        1
    );
    assert_eq!(scope.count_company_order_by_name(&renamed_company).await, 0);

    let (company_delete_status, company_delete_json) = json_request(
        app.clone(),
        "DELETE",
        &format!("/api/company/{company_id}"),
        Some(&admin_token),
        "",
    )
    .await;
    assert_eq!(company_delete_status, StatusCode::OK);
    assert_eq!(company_delete_json["code"], 0);
    assert_eq!(company_delete_json["message"], "删除发货公司成功！");

    let (company_detail_after_delete_status, company_detail_after_delete_json) = json_request(
        app.clone(),
        "GET",
        &format!("/api/company/{company_id}"),
        Some(&admin_token),
        "",
    )
    .await;
    assert_eq!(company_detail_after_delete_status, StatusCode::OK);
    assert!(company_detail_after_delete_json["data"]
        .as_array()
        .expect("deleted company detail should remain old array shape")
        .is_empty());

    let boundary = "admin-yh-real-mysql-avatar-boundary";
    let avatar_body = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"avatar\"; filename=\"avatar.png\"\r\nContent-Type: image/png\r\n\r\nMYSQLPNG\r\n--{boundary}--\r\n"
    );
    let avatar_upload_response = raw_request(
        app.clone(),
        "POST",
        "/api/upload/avatar",
        Some(&admin_token),
        Some(&format!("multipart/form-data; boundary={boundary}")),
        Body::from(avatar_body),
    )
    .await;
    let avatar_upload_status = avatar_upload_response.status();
    let avatar_upload_body = axum::body::to_bytes(avatar_upload_response.into_body(), usize::MAX)
        .await
        .expect("avatar upload body should be readable");
    let avatar_upload_json: Value =
        serde_json::from_slice(&avatar_upload_body).expect("avatar upload should return JSON");
    assert_eq!(avatar_upload_status, StatusCode::OK);
    assert_eq!(avatar_upload_json["code"], 0);
    assert_eq!(avatar_upload_json["message"], "上传头像成功！");

    let avatar_row = scope.admin_avatar_row().await;
    let avatar_filename = avatar_row.filename;
    assert!(avatar_filename.ends_with(".png"));
    assert_eq!(avatar_row.mimetype, "image/png");
    assert_eq!(avatar_row.size, 8);
    assert_eq!(
        avatar_row.avatar_url,
        format!("/users/{}/avatar", scope.admin_user_id)
    );
    assert_eq!(
        tokio::fs::read(avatar_dir.join(&avatar_filename))
            .await
            .expect("uploaded avatar file should exist"),
        b"MYSQLPNG"
    );

    let avatar_response = raw_request(
        app.clone(),
        "GET",
        &format!("/api/users/{}/avatar", scope.admin_user_id),
        None,
        None,
        Body::empty(),
    )
    .await;
    assert_eq!(avatar_response.status(), StatusCode::OK);
    assert_eq!(
        avatar_response.headers().get("content-type").unwrap(),
        "image/png"
    );
    let avatar_bytes = axum::body::to_bytes(avatar_response.into_body(), usize::MAX)
        .await
        .expect("avatar response body should be readable");
    assert_eq!(&avatar_bytes[..], b"MYSQLPNG");

    tokio::fs::remove_file(avatar_dir.join(&avatar_filename))
        .await
        .expect("uploaded avatar fixture should be removable");
    let fallback_response = raw_request(
        app.clone(),
        "GET",
        &format!("/api/users/{}/avatar", scope.admin_user_id),
        None,
        None,
        Body::empty(),
    )
    .await;
    assert_eq!(fallback_response.status(), StatusCode::OK);
    let fallback_bytes = axum::body::to_bytes(fallback_response.into_body(), usize::MAX)
        .await
        .expect("fallback avatar body should be readable");
    assert_eq!(&fallback_bytes[..], b"DEFAULT_AVATAR");

    let bad_field_boundary = "admin-yh-real-mysql-avatar-bad-field";
    let bad_field_body = format!(
        "--{bad_field_boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"avatar.png\"\r\nContent-Type: image/png\r\n\r\nPNGDATA\r\n--{bad_field_boundary}--\r\n"
    );
    let bad_field_response = raw_request(
        app.clone(),
        "POST",
        "/api/upload/avatar",
        Some(&admin_token),
        Some(&format!(
            "multipart/form-data; boundary={bad_field_boundary}"
        )),
        Body::from(bad_field_body),
    )
    .await;
    let bad_field_status = bad_field_response.status();
    let bad_field_body = axum::body::to_bytes(bad_field_response.into_body(), usize::MAX)
        .await
        .expect("bad field body should be readable");
    let bad_field_json: Value =
        serde_json::from_slice(&bad_field_body).expect("bad field should return JSON");
    assert_eq!(bad_field_status, StatusCode::BAD_REQUEST);
    assert_eq!(bad_field_json["code"], -400);
    assert_eq!(bad_field_json["message"], "请求参数错误: 缺少头像文件");

    let (resources_status, resources_json) =
        json_request(app, "GET", "/api/admin/resources", Some(&admin_token), "").await;
    assert_eq!(resources_status, StatusCode::OK);
    assert_eq!(resources_json["code"], 0);
    let resources = resources_json["data"]
        .as_array()
        .expect("resource registry should return an array");
    assert_eq!(resources.len(), 6);
    assert_eq!(
        resource_count(resources, "orders"),
        scope.table_count("order_list").await
    );
    assert_eq!(
        resource_count(resources, "receipts"),
        scope.table_count("receipt").await
    );
    assert_eq!(
        resource_count(resources, "companies"),
        scope.table_count("company").await
    );
    assert_eq!(
        resource_count(resources, "users"),
        scope.table_count("user").await
    );
    assert_eq!(
        resource_count(resources, "roles"),
        scope.table_count("role").await
    );
    assert_eq!(
        resource_count(resources, "menus"),
        scope.reachable_menu_count().await
    );
    assert_eq!(
        resource_field(resources, "orders", "apiPath"),
        "/order/list"
    );
    assert_eq!(
        resource_field(resources, "menus", "legacyPath"),
        "adminYh/src/router"
    );

    scope.cleanup().await;
    let _ = tokio::fs::remove_dir_all(avatar_root).await;
}

fn test_state(pool: MySqlPool, avatar_dir: Option<PathBuf>) -> AppState {
    let mut config = AppConfig::from_env().expect("config should load");
    config.database.url = env::var("ADMIN_DB_TEST_DATABASE_URL")
        .expect("RUN_DB_TESTS=true requires ADMIN_DB_TEST_DATABASE_URL");
    if let Some(avatar_dir) = avatar_dir {
        config.storage.avatar_dir = avatar_dir.to_string_lossy().into_owned();
    }
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

async fn raw_request(
    app: axum::Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    content_type: Option<&str>,
    body: Body,
) -> axum::response::Response {
    let mut builder = Request::builder().method(method).uri(uri);
    if let Some(content_type) = content_type {
        builder = builder.header(CONTENT_TYPE, content_type);
    }
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }

    app.oneshot(builder.body(body).expect("request should build"))
        .await
        .expect("request should succeed")
}

struct AvatarRow {
    filename: String,
    mimetype: String,
    size: i64,
    avatar_url: String,
}

struct TestScope<'a> {
    pool: &'a MySqlPool,
    prefix: String,
    admin_name: String,
    operator_name: String,
    admin_user_id: i64,
    operator_user_id: i64,
    operator_role_id: i64,
    company_id: i64,
    menu_root_id: i64,
    menu_child_id: i64,
    consignee: String,
    consignor: String,
}

impl<'a> TestScope<'a> {
    async fn new(pool: &'a MySqlPool) -> Self {
        let prefix = format!("API{}", Uuid::new_v4().simple());
        let user_base_id = next_id(pool, "user").await + 10_000;
        let menu_base_id = next_id(pool, "permission").await + 10_000;
        let scope = Self {
            pool,
            admin_name: format!("{prefix}-admin"),
            operator_name: format!("{prefix}-operator"),
            operator_role_id: user_base_id + 10,
            admin_user_id: user_base_id,
            operator_user_id: user_base_id + 1,
            company_id: next_id(pool, "company").await + 10_000,
            menu_root_id: menu_base_id,
            menu_child_id: menu_base_id + 1,
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
        self.seed_resource_registry_rows().await;
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

    async fn seed_resource_registry_rows(&self) {
        sqlx::query("INSERT INTO `company` (`id`, `name`) VALUES (?, ?)")
            .bind(self.company_id)
            .bind(format!("{}-资源注册公司", self.prefix))
            .execute(self.pool)
            .await
            .expect("company registry seed should insert");

        sqlx::query(
            r#"
            INSERT INTO `permission` (`id`, `pid`, `name`, `type`, `url`, `icon`, `sort`)
            VALUES (?, 0, ?, 1, ?, 'box', 10), (?, ?, ?, 2, ?, 'dot', 11)
            "#,
        )
        .bind(self.menu_root_id)
        .bind(format!("{}-资源菜单", self.prefix))
        .bind(format!("/main/{}", self.prefix))
        .bind(self.menu_child_id)
        .bind(self.menu_root_id)
        .bind(format!("{}-资源子菜单", self.prefix))
        .bind(format!("/main/{}/child", self.prefix))
        .execute(self.pool)
        .await
        .expect("permission registry seed should insert");
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

    fn company_order_name(&self) -> String {
        format!("{}-发货公司", self.prefix)
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

    async fn admin_avatar_row(&self) -> AvatarRow {
        let row = sqlx::query(
            r#"
            SELECT
                a.`filename`,
                a.`mimetype`,
                a.`size`,
                u.`avatar_url`,
                COUNT(*) OVER (PARTITION BY a.`user_id`) AS avatar_count
            FROM `avatar` a
            INNER JOIN `user` u ON u.`id` = a.`user_id`
            WHERE a.`user_id` = ?
            "#,
        )
        .bind(self.admin_user_id)
        .fetch_one(self.pool)
        .await
        .expect("admin avatar row should load");
        assert_eq!(
            row.try_get::<i64, _>("avatar_count")
                .expect("avatar count should exist"),
            1,
            "avatar upload must replace metadata instead of leaking duplicate avatar rows"
        );
        AvatarRow {
            filename: row.try_get("filename").expect("filename should exist"),
            mimetype: row.try_get("mimetype").expect("mimetype should exist"),
            size: row.try_get("size").expect("size should exist"),
            avatar_url: row.try_get("avatar_url").expect("avatar_url should exist"),
        }
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

    async fn count_company_order_by_name(&self, name: &str) -> i64 {
        sqlx::query("SELECT COUNT(*) AS total FROM `company_order` WHERE `com_name` = ?")
            .bind(name)
            .fetch_one(self.pool)
            .await
            .expect("company_order name count should load")
            .try_get("total")
            .expect("total should exist")
    }

    async fn company_id_by_name(&self, name: &str) -> i64 {
        sqlx::query("SELECT `id` FROM `company` WHERE `name` = ?")
            .bind(name)
            .fetch_one(self.pool)
            .await
            .expect("company id should load")
            .try_get("id")
            .expect("company id should exist")
    }

    async fn table_count(&self, table: &str) -> u64 {
        let sql = format!("SELECT COUNT(*) AS total FROM `{table}`");
        sqlx::query(&sql)
            .fetch_one(self.pool)
            .await
            .expect("table count should load")
            .try_get::<i64, _>("total")
            .expect("total should exist") as u64
    }

    async fn reachable_menu_count(&self) -> u64 {
        sqlx::query(
            r#"
            WITH RECURSIVE menu_tree AS (
                SELECT `id`
                FROM `permission`
                WHERE (`pid` IS NULL OR `pid` <= 0) AND `type` = 1
                UNION ALL
                SELECT child.`id`
                FROM `permission` child
                INNER JOIN menu_tree parent ON child.`pid` = parent.`id`
            )
            SELECT COUNT(*) AS total FROM menu_tree
            "#,
        )
        .fetch_one(self.pool)
        .await
        .expect("reachable menu count should load")
        .try_get::<i64, _>("total")
        .expect("total should exist") as u64
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
        sqlx::query("DELETE FROM `avatar` WHERE `user_id` IN (?, ?)")
            .bind(self.admin_user_id)
            .bind(self.operator_user_id)
            .execute(self.pool)
            .await
            .expect("avatar cleanup should run");
        sqlx::query("DELETE FROM `role_permission` WHERE `permission_id` IN (?, ?)")
            .bind(self.menu_root_id)
            .bind(self.menu_child_id)
            .execute(self.pool)
            .await
            .expect("role_permission cleanup should run");
        sqlx::query("DELETE FROM `permission` WHERE `id` IN (?, ?)")
            .bind(self.menu_root_id)
            .bind(self.menu_child_id)
            .execute(self.pool)
            .await
            .expect("permission cleanup should run");
        sqlx::query("DELETE FROM `company` WHERE `id` = ? OR `name` LIKE ?")
            .bind(self.company_id)
            .bind(format!("{}-%", self.prefix))
            .execute(self.pool)
            .await
            .expect("company cleanup should run");
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

fn resource_count(resources: &[Value], key: &str) -> u64 {
    resources
        .iter()
        .find(|resource| resource["key"] == key)
        .unwrap_or_else(|| panic!("resource {key} should exist"))
        .get("count")
        .and_then(Value::as_u64)
        .unwrap_or_else(|| panic!("resource {key} count should be numeric"))
}

fn resource_field<'a>(resources: &'a [Value], key: &str, field: &str) -> &'a str {
    resources
        .iter()
        .find(|resource| resource["key"] == key)
        .unwrap_or_else(|| panic!("resource {key} should exist"))
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("resource {key}.{field} should be string"))
}

fn find_company(companies: &[Value], company_id: i64) -> &Value {
    companies
        .iter()
        .find(|company| company["id"] == company_id)
        .unwrap_or_else(|| panic!("company {company_id} should exist in list"))
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

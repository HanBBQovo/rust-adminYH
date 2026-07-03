use std::sync::Arc;

use admin_api::{build_router, AppConfig, AppServices, AppState};
use admin_core::{
    domain::AuthUser,
    services::{
        development_auth_service, development_chart_service, development_company_service,
        development_menu_service, development_order_services, development_role_service,
        development_user_service, InMemoryAuthUserStore, StaticHealthService,
    },
};
use axum::body::Body;
use http::{header::CONTENT_TYPE, Request, StatusCode};
use tower::ServiceExt;

fn test_state() -> AppState {
    test_state_with_user(
        AuthUser::with_legacy_md5_password(58, "admin", "secret").with_role_ids([1]),
    )
}

fn test_state_with_user(user: AuthUser) -> AppState {
    let config = AppConfig::from_env().expect("config should load");
    let store = Arc::new(InMemoryAuthUserStore::new([user]));
    let (order_service, receipt_service, memory_service) = development_order_services();
    AppState::with_services(
        config,
        AppServices {
            health_service: Arc::new(StaticHealthService::new(
                "rust-adminYH",
                env!("CARGO_PKG_VERSION"),
            )),
            auth_service: Arc::new(development_auth_service(store)),
            menu_service: Arc::new(development_menu_service()),
            chart_service: Arc::new(development_chart_service()),
            company_service: Arc::new(development_company_service()),
            user_service: Arc::new(development_user_service()),
            role_service: Arc::new(development_role_service()),
            order_service: Arc::new(order_service),
            receipt_service: Arc::new(receipt_service),
            memory_service: Arc::new(memory_service),
        },
    )
}

fn operator_state() -> AppState {
    test_state_with_user(
        AuthUser::with_legacy_md5_password(59, "operator", "secret").with_role_ids([2]),
    )
}

async fn login_token(app: axum::Router, name: &str) -> String {
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/login")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(format!(
                    r#"{{"name":"{name}","password":"secret"}}"#
                )))
                .expect("request should build"),
        )
        .await
        .expect("request should succeed");
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body should be readable");
    let json: serde_json::Value = serde_json::from_slice(&body).expect("body should be JSON");

    json["data"]["token"]
        .as_str()
        .expect("token should exist")
        .to_owned()
}

async fn json_request(
    app: axum::Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    body: &str,
) -> (StatusCode, serde_json::Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(CONTENT_TYPE, "application/json");
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
    let json: serde_json::Value = serde_json::from_slice(&body).expect("body should be JSON");

    (status, json)
}

async fn get_json(app: axum::Router, uri: &str, token: &str) -> (StatusCode, serde_json::Value) {
    let response = app
        .oneshot(
            Request::builder()
                .uri(uri)
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("request should succeed");
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body should be readable");
    let json: serde_json::Value = serde_json::from_slice(&body).expect("body should be JSON");

    (status, json)
}

#[tokio::test]
async fn role_menu_returns_legacy_children_shape() {
    let app = build_router(test_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = get_json(app, "/api/role/1/menu", &token).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], 0);
    assert_eq!(json["message"], "success");
    assert_eq!(json["data"][0]["name"], "工作台");
    assert_eq!(json["data"][0]["children"][0]["name"], "核心统计");
    assert_eq!(json["data"][0]["children"][0]["parentId"], 1);
    assert_eq!(json["data"][0]["children"][0]["partentId"], 1);
    assert!(json["data"][0]["chilren"].is_null());
}

#[tokio::test]
async fn full_menu_tree_keeps_old_chilren_typo() {
    let app = build_router(test_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = get_json(app, "/api/menu/tree", &token).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], 0);
    assert_eq!(json["data"][1]["name"], "订单管理");
    assert_eq!(json["data"][1]["chilren"][0]["name"], "运单列表");
    assert!(json["data"][1]["children"].is_null());
}

#[tokio::test]
async fn role_menu_ids_returns_role_summary_and_ids() {
    let app = build_router(test_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = get_json(app, "/api/role/1/menuIds", &token).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], 0);
    assert_eq!(json["data"]["id"], 1);
    assert_eq!(json["data"]["name"], "超级管理员");
    assert!(json["data"]["menuIds"]
        .as_array()
        .expect("menu ids should be array")
        .iter()
        .any(|value| value == 21));
}

#[tokio::test]
async fn menu_endpoints_reject_missing_token_with_legacy_shape() {
    let app = build_router(test_state());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/menu/tree")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("request should succeed");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body should be readable");
    let json: serde_json::Value = serde_json::from_slice(&body).expect("body should be JSON");

    assert_eq!(json["code"], -200);
    assert_eq!(json["data"], serde_json::Value::Null);
    assert_eq!(json["message"], "未登录或登录已失效");
}

#[tokio::test]
async fn menu_endpoints_reject_invalid_token_with_legacy_shape() {
    let app = build_router(test_state());

    let (status, json) = get_json(app, "/api/role/1/menu", "missing-token").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], -200);
    assert_eq!(json["message"], "无效的token或登录已失效！请重新登录~");
}

#[tokio::test]
async fn admin_can_create_menu_from_api_and_legacy_paths() {
    let app = build_router(test_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, created) = json_request(
        app.clone(),
        "POST",
        "/api/menu",
        Some(&token),
        r#"{"name":"菜单管理","type":2,"url":"/main/system/menu","sort":2,"parentId":3}"#,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(created["code"], 0);
    assert_eq!(created["message"], "创建菜单成功！");

    let (legacy_status, legacy_created) = json_request(
        app.clone(),
        "POST",
        "/menu",
        Some(&token),
        r#"{"name":"权限按钮","url":"/main/system/menu/actions","sort":3,"partentId":3}"#,
    )
    .await;
    assert_eq!(legacy_status, StatusCode::OK);
    assert_eq!(legacy_created["code"], 0);

    let (_, tree) = get_json(app, "/api/menu/tree", &token).await;
    let system_children = tree["data"][2]["chilren"].as_array().unwrap();
    assert!(system_children
        .iter()
        .any(|item| item["name"] == "菜单管理" && item["parentId"] == 3));
    assert!(system_children
        .iter()
        .any(|item| item["name"] == "权限按钮" && item["parentId"] == 3));
    assert!(tree["data"][2]["children"].is_null());
}

#[tokio::test]
async fn admin_can_read_update_and_delete_leaf_menu_from_api_and_legacy_paths() {
    let app = build_router(test_state());
    let token = login_token(app.clone(), "admin").await;

    let (detail_status, detail) = get_json(app.clone(), "/api/menu/31", &token).await;
    assert_eq!(detail_status, StatusCode::OK);
    assert_eq!(detail["code"], 0);
    assert_eq!(detail["data"]["name"], "用户管理");
    assert_eq!(detail["data"]["parentId"], 3);

    let (update_status, updated) = json_request(
        app.clone(),
        "PATCH",
        "/api/menu/31",
        Some(&token),
        r#"{"name":"账号管理","type":2,"url":"/main/system/accounts","icon":"Users","sort":4,"parentId":3}"#,
    )
    .await;
    assert_eq!(update_status, StatusCode::OK);
    assert_eq!(updated["code"], 0);
    assert_eq!(updated["message"], "修改菜单成功！");

    let (_, legacy_detail) = get_json(app.clone(), "/menu/31", &token).await;
    assert_eq!(legacy_detail["data"]["name"], "账号管理");
    assert_eq!(legacy_detail["data"]["url"], "/main/system/accounts");
    assert_eq!(legacy_detail["data"]["icon"], "Users");

    let (delete_status, removed) =
        json_request(app.clone(), "DELETE", "/api/menu/31", Some(&token), "{}").await;
    assert_eq!(delete_status, StatusCode::OK);
    assert_eq!(removed["code"], 0);
    assert_eq!(removed["message"], "删除菜单成功！");

    let (_, missing) = get_json(app, "/api/menu/31", &token).await;
    assert!(missing["data"].is_null());
}

#[tokio::test]
async fn menu_update_and_delete_require_admin_role() {
    let app = build_router(operator_state());
    let token = login_token(app.clone(), "operator").await;

    let (update_status, update_json) = json_request(
        app.clone(),
        "PATCH",
        "/api/menu/31",
        Some(&token),
        r#"{"name":"账号管理","type":2,"url":"/main/system/accounts","sort":4,"parentId":3}"#,
    )
    .await;
    assert_eq!(update_status, StatusCode::FORBIDDEN);
    assert_eq!(update_json["code"], -403);
    assert_eq!(update_json["message"], "没有权限执行该操作");

    let (delete_status, delete_json) =
        json_request(app, "DELETE", "/api/menu/31", Some(&token), "{}").await;
    assert_eq!(delete_status, StatusCode::FORBIDDEN);
    assert_eq!(delete_json["code"], -403);
    assert_eq!(delete_json["message"], "没有权限执行该操作");
}

#[tokio::test]
async fn menu_update_and_delete_reject_invalid_tree_changes() {
    let app = build_router(test_state());
    let token = login_token(app.clone(), "admin").await;

    let (self_parent_status, self_parent) = json_request(
        app.clone(),
        "PATCH",
        "/api/menu/31",
        Some(&token),
        r#"{"name":"用户管理","type":2,"url":"/main/system/user","sort":1,"parentId":31}"#,
    )
    .await;
    assert_eq!(self_parent_status, StatusCode::BAD_REQUEST);
    assert_eq!(self_parent["code"], -400);
    assert_eq!(self_parent["message"], "请求参数错误: 父级菜单不能选择自身");

    let (delete_status, delete_json) =
        json_request(app, "DELETE", "/api/menu/3", Some(&token), "{}").await;
    assert_eq!(delete_status, StatusCode::BAD_REQUEST);
    assert_eq!(delete_json["code"], -400);
    assert_eq!(delete_json["message"], "请求参数错误: 存在子菜单，不能删除");
}

#[tokio::test]
async fn menu_create_rejects_empty_name() {
    let app = build_router(test_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = json_request(
        app,
        "POST",
        "/api/menu",
        Some(&token),
        r#"{"name":"  ","type":1}"#,
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(json["code"], -400);
    assert_eq!(json["message"], "请求参数错误: 菜单名称不能为空");
}

#[tokio::test]
async fn menu_create_requires_admin_role() {
    let app = build_router(operator_state());
    let token = login_token(app.clone(), "operator").await;

    let (status, json) = json_request(
        app,
        "POST",
        "/api/menu",
        Some(&token),
        r#"{"name":"菜单管理","type":1}"#,
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(json["code"], -403);
    assert_eq!(json["message"], "没有权限执行该操作");
}

use std::sync::Arc;

use admin_api::{build_router, AppConfig, AppServices, AppState};
use admin_core::{
    domain::AuthUser,
    services::{
        development_auth_service, development_company_service, development_menu_service,
        development_order_services, development_role_service, development_user_service,
        InMemoryAuthUserStore, StaticHealthService,
    },
};
use axum::body::Body;
use http::{header::CONTENT_TYPE, Request, StatusCode};
use tower::ServiceExt;

fn test_state_with_user(user: AuthUser) -> AppState {
    let config = AppConfig::from_env().expect("config should load");
    let store = Arc::new(InMemoryAuthUserStore::new([user]));
    let (order_service, receipt_service) = development_order_services();
    AppState::with_services(
        config,
        AppServices {
            health_service: Arc::new(StaticHealthService::new(
                "rust-adminYH",
                env!("CARGO_PKG_VERSION"),
            )),
            auth_service: Arc::new(development_auth_service(store)),
            menu_service: Arc::new(development_menu_service()),
            company_service: Arc::new(development_company_service()),
            user_service: Arc::new(development_user_service()),
            role_service: Arc::new(development_role_service()),
            order_service: Arc::new(order_service),
            receipt_service: Arc::new(receipt_service),
        },
    )
}

fn admin_state() -> AppState {
    test_state_with_user(
        AuthUser::with_legacy_md5_password(58, "admin", "secret").with_role_ids([1]),
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

#[tokio::test]
async fn role_list_returns_legacy_shape_and_filters() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = json_request(
        app,
        "POST",
        "/api/role/list",
        Some(&token),
        r#"{"offset":0,"size":10,"name":"超级","intro":"所有","createAt":["2026-01-01","2026-01-31"]}"#,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], 0);
    assert_eq!(json["data"]["totalCount"], 1);
    assert_eq!(json["data"]["list"][0]["id"], 1);
    assert_eq!(json["data"]["list"][0]["name"], "超级管理员");
    assert!(json["data"]["list"][0]["createAt"].is_string());
    assert!(json["data"]["list"][0]["updateAt"].is_string());
}

#[tokio::test]
async fn role_detail_returns_legacy_role_record() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = json_request(app, "GET", "/api/role/1", Some(&token), "").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], 0);
    assert_eq!(json["data"]["id"], 1);
    assert_eq!(json["data"]["name"], "超级管理员");
    assert_eq!(json["data"]["intro"], "所有权限");
}

#[tokio::test]
async fn admin_can_create_update_assign_and_delete_role() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (_, created) = json_request(
        app.clone(),
        "POST",
        "/api/role",
        Some(&token),
        r#"{"name":"财务","intro":"部分权限"}"#,
    )
    .await;
    assert_eq!(created["code"], 0);
    assert_eq!(created["message"], "创建权限角色成功！");

    let (_, updated) = json_request(
        app.clone(),
        "PATCH",
        "/api/role/3",
        Some(&token),
        r#"{"name":"财务主管","intro":"所有权限"}"#,
    )
    .await;
    assert_eq!(updated["code"], 0);
    assert_eq!(updated["message"], "修改角色信息成功!");

    let (_, assigned) = json_request(
        app.clone(),
        "POST",
        "/api/role/assign",
        Some(&token),
        r#"{"roleId":3,"menuList":[1,11,11,21]}"#,
    )
    .await;
    assert_eq!(assigned["code"], 0);
    assert_eq!(assigned["message"], "分配权限成功！");

    let (_, detail) = json_request(app.clone(), "GET", "/api/role/3", Some(&token), "").await;
    assert_eq!(detail["data"]["name"], "财务主管");

    let (_, deleted) = json_request(app.clone(), "DELETE", "/api/role/3", Some(&token), "").await;
    assert_eq!(deleted["code"], 0);
    assert_eq!(deleted["message"], "删除权限角色成功！");

    let (_, detail_after_delete) = json_request(app, "GET", "/api/role/3", Some(&token), "").await;
    assert!(detail_after_delete["data"].is_null());
}

#[tokio::test]
async fn role_create_rejects_empty_name() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = json_request(
        app,
        "POST",
        "/api/role",
        Some(&token),
        r#"{"name":"  ","intro":"部分权限"}"#,
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(json["code"], -400);
    assert_eq!(json["message"], "请求参数错误: 角色名不能为空");
}

#[tokio::test]
async fn role_list_rejects_missing_token() {
    let app = build_router(admin_state());

    let (status, json) = json_request(
        app,
        "POST",
        "/api/role/list",
        None,
        r#"{"offset":0,"size":10}"#,
    )
    .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(json["code"], -200);
    assert_eq!(json["message"], "未登录或登录已失效");
}

#[tokio::test]
async fn role_writes_require_admin_role() {
    let app = build_router(operator_state());
    let token = login_token(app.clone(), "operator").await;

    let (status, json) = json_request(
        app,
        "POST",
        "/api/role",
        Some(&token),
        r#"{"name":"财务","intro":"部分权限"}"#,
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(json["code"], -403);
    assert_eq!(json["message"], "没有权限执行该操作");
}

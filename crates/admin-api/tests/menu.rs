use std::sync::Arc;

use admin_api::{build_router, AppConfig, AppState};
use admin_core::services::{
    development_auth_service, development_menu_service, InMemoryAuthUserStore, StaticHealthService,
};
use axum::body::Body;
use http::{header::CONTENT_TYPE, Request, StatusCode};
use tower::ServiceExt;

fn test_state() -> AppState {
    let config = AppConfig::from_env().expect("config should load");
    let store = Arc::new(InMemoryAuthUserStore::single_legacy_user(
        58, "admin", "secret",
    ));
    AppState::with_services(
        config,
        Arc::new(StaticHealthService::new(
            "rust-adminYH",
            env!("CARGO_PKG_VERSION"),
        )),
        Arc::new(development_auth_service(store)),
        Arc::new(development_menu_service()),
    )
}

async fn login_token(app: axum::Router) -> String {
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/login")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"name":"admin","password":"secret"}"#))
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
    let token = login_token(app.clone()).await;

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
    let token = login_token(app.clone()).await;

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
    let token = login_token(app.clone()).await;

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

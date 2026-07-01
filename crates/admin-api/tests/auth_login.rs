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

#[tokio::test]
async fn login_endpoint_returns_legacy_success_shape() {
    let app = build_router(test_state());

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

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body should be readable");
    let json: serde_json::Value = serde_json::from_slice(&body).expect("body should be JSON");

    assert_eq!(json["code"], 0);
    assert_eq!(json["message"], "success");
    assert_eq!(json["data"]["id"], 58);
    assert_eq!(json["data"]["name"], "admin");
    assert!(json["data"]["token"]
        .as_str()
        .unwrap()
        .starts_with("dev-58-"));
}

#[tokio::test]
async fn login_endpoint_keeps_legacy_error_for_bad_password() {
    let app = build_router(test_state());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/login")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"name":"admin","password":"wrong"}"#))
                .expect("request should build"),
        )
        .await
        .expect("request should succeed");

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body should be readable");
    let json: serde_json::Value = serde_json::from_slice(&body).expect("body should be JSON");

    assert_eq!(json["code"], -200);
    assert_eq!(json["data"], serde_json::Value::Null);
    assert_eq!(json["message"], "密码错误，请重新输入密码尝试登录！");
}

use std::sync::Arc;

use admin_api::{build_router, AppConfig, AppState};
use admin_core::services::{development_auth_service, InMemoryAuthUserStore, StaticHealthService};
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

#[tokio::test]
async fn users_me_returns_current_user_for_login_token() {
    let app = build_router(test_state());
    let token = login_token(app.clone()).await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/users/me")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
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
    assert!(json["data"]["roles"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn users_me_rejects_missing_token_with_legacy_shape() {
    let app = build_router(test_state());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/users/me")
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
}

#[tokio::test]
async fn users_me_rejects_old_token_after_second_login() {
    let app = build_router(test_state());
    let first_token = login_token(app.clone()).await;
    let second_token = login_token(app.clone()).await;

    assert_ne!(first_token, second_token);

    let old_token_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/users/me")
                .header("authorization", format!("Bearer {first_token}"))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("request should succeed");
    assert_eq!(old_token_response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(old_token_response.into_body(), usize::MAX)
        .await
        .expect("body should be readable");
    let json: serde_json::Value = serde_json::from_slice(&body).expect("body should be JSON");
    assert_eq!(json["code"], -200);
    assert_eq!(json["message"], "无效的token或登录已失效！请重新登录~");

    let current_token_response = app
        .oneshot(
            Request::builder()
                .uri("/api/users/me")
                .header("authorization", format!("Bearer {second_token}"))
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("request should succeed");
    assert_eq!(current_token_response.status(), StatusCode::OK);
}

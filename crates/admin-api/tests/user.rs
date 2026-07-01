use std::sync::Arc;

use admin_api::{build_router, AppConfig, AppState};
use admin_core::{
    domain::AuthUser,
    services::{
        development_auth_service, development_company_service, development_menu_service,
        development_user_service, InMemoryAuthUserStore, StaticHealthService,
    },
};
use axum::body::Body;
use http::{header::CONTENT_TYPE, Request, StatusCode};
use tower::ServiceExt;

fn test_state_with_user(user: AuthUser) -> AppState {
    let config = AppConfig::from_env().expect("config should load");
    let store = Arc::new(InMemoryAuthUserStore::new([user]));
    AppState::with_services(
        config,
        Arc::new(StaticHealthService::new(
            "rust-adminYH",
            env!("CARGO_PKG_VERSION"),
        )),
        Arc::new(development_auth_service(store)),
        Arc::new(development_menu_service()),
        Arc::new(development_company_service()),
        Arc::new(development_user_service()),
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
async fn users_list_returns_legacy_shape_and_filters() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = json_request(
        app,
        "POST",
        "/api/users/list",
        Some(&token),
        r#"{"offset":0,"size":10,"name":"admin","enable":1,"roleId":1,"createAt":["2026-01-01","2026-01-31"]}"#,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], 0);
    assert_eq!(json["data"]["totalCount"], 1);
    assert_eq!(json["data"]["list"][0]["id"], 58);
    assert_eq!(json["data"]["list"][0]["roleId"], 1);
    assert!(json["data"]["list"][0]["avatarUrl"]
        .as_str()
        .unwrap()
        .ends_with("/users/58/avatar"));
}

#[tokio::test]
async fn user_detail_returns_role_object() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = json_request(app, "GET", "/api/users/58", Some(&token), "").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], 0);
    assert_eq!(json["data"]["id"], 58);
    assert_eq!(json["data"]["role"]["id"], 1);
    assert_eq!(json["data"]["role"]["name"], "超级管理员");
}

#[tokio::test]
async fn admin_can_create_update_password_and_delete_user() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (_, created) = json_request(
        app.clone(),
        "POST",
        "/api/users",
        Some(&token),
        r#"{"name":"new_user","password":"secret2","roleId":2}"#,
    )
    .await;
    assert_eq!(created["code"], 0);
    assert_eq!(created["message"], "创建用户成功！");

    let (_, updated) = json_request(
        app.clone(),
        "PATCH",
        "/api/users/60",
        Some(&token),
        r#"{"name":"renamed","roleId":1}"#,
    )
    .await;
    assert_eq!(updated["code"], 0);
    assert_eq!(updated["message"], "修改用户信息成功!");

    let (_, password_updated) = json_request(
        app.clone(),
        "PATCH",
        "/api/users/60/password",
        Some(&token),
        r#"{"password":"new-secret"}"#,
    )
    .await;
    assert_eq!(password_updated["code"], 0);
    assert_eq!(password_updated["message"], "修改密码成功！");

    let (_, deleted) = json_request(app.clone(), "DELETE", "/api/users/60", Some(&token), "").await;
    assert_eq!(deleted["code"], 0);
    assert_eq!(deleted["message"], "删除用户成功！");

    let (_, detail) = json_request(app, "GET", "/api/users/60", Some(&token), "").await;
    assert!(detail["data"].is_null());
}

#[tokio::test]
async fn user_password_accepts_raw_string_body() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = json_request(
        app,
        "PATCH",
        "/api/users/59/password",
        Some(&token),
        r#""raw-secret""#,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], 0);
    assert_eq!(json["message"], "修改密码成功！");
}

#[tokio::test]
async fn protected_user_58_delete_keeps_legacy_error() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = json_request(app, "DELETE", "/api/users/58", Some(&token), "").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], -200);
    assert_eq!(json["message"], "删除用户失败！");
}

#[tokio::test]
async fn user_create_rejects_duplicate_name() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = json_request(
        app,
        "POST",
        "/api/users",
        Some(&token),
        r#"{"name":"admin","password":"secret","roleId":1}"#,
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(json["code"], -400);
    assert_eq!(json["message"], "请求参数错误: 用户已存在");
}

#[tokio::test]
async fn user_writes_require_admin_role() {
    let app = build_router(operator_state());
    let token = login_token(app.clone(), "operator").await;

    let (status, json) = json_request(
        app,
        "POST",
        "/api/users",
        Some(&token),
        r#"{"name":"new_user","password":"secret2","roleId":2}"#,
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(json["code"], -403);
    assert_eq!(json["message"], "没有权限执行该操作");
}

#[tokio::test]
async fn user_list_rejects_missing_token() {
    let app = build_router(admin_state());

    let (status, json) = json_request(
        app,
        "POST",
        "/api/users/list",
        None,
        r#"{"offset":0,"size":10}"#,
    )
    .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(json["code"], -200);
    assert_eq!(json["message"], "未登录或登录已失效");
}

#[tokio::test]
async fn user_avatar_route_is_public_and_sets_mimetype() {
    let app = build_router(admin_state());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/users/58/avatar")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("request should succeed");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("content-type").unwrap(),
        "image/jpeg"
    );
}

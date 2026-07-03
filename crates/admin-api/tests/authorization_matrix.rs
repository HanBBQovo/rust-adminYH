use std::{path::Path, sync::Arc};

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

fn state_with_user(user: AuthUser) -> AppState {
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

fn admin_state() -> AppState {
    state_with_user(AuthUser::with_legacy_md5_password(58, "admin", "secret").with_role_ids([1]))
}

fn operator_state() -> AppState {
    state_with_user(AuthUser::with_legacy_md5_password(59, "operator", "secret").with_role_ids([2]))
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

async fn empty_get(app: axum::Router, uri: &str, token: Option<&str>) -> (StatusCode, Vec<u8>) {
    let mut builder = Request::builder().uri(uri);
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    let response = app
        .oneshot(builder.body(Body::empty()).expect("request should build"))
        .await
        .expect("request should succeed");
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body should be readable")
        .to_vec();
    (status, body)
}

#[tokio::test]
async fn read_routes_require_login_but_allow_operator_sessions() {
    let app = build_router(operator_state());
    let token = login_token(app.clone(), "operator").await;

    for (method, uri, body) in [
        ("POST", "/api/users/list", r#"{"offset":0,"size":10}"#),
        ("GET", "/api/menu/tree", ""),
        ("GET", "/api/chart/headerList", ""),
        ("POST", "/api/memory/list", ""),
        ("POST", "/api/receipt/list", r#"{"offset":0,"size":10}"#),
        ("POST", "/api/notrecovery/list", r#"{"offset":0,"size":10}"#),
        ("POST", "/api/recovery/list", r#"{"offset":0,"size":10}"#),
    ] {
        let (missing_status, missing_json) =
            json_request(app.clone(), method, uri, None, body).await;
        assert_eq!(missing_status, StatusCode::UNAUTHORIZED, "{uri}");
        assert_eq!(missing_json["code"], -200, "{uri}");
        assert_eq!(missing_json["message"], "未登录或登录已失效", "{uri}");

        let (operator_status, operator_json) =
            json_request(app.clone(), method, uri, Some(&token), body).await;
        assert_eq!(operator_status, StatusCode::OK, "{uri}");
        if uri != "/api/memory/list" {
            assert_eq!(operator_json["code"], 0, "{uri}");
        } else {
            assert!(operator_json["data"].is_array(), "{uri}");
            assert!(operator_json["code"].is_null(), "{uri}");
        }
    }
}

#[tokio::test]
async fn admin_write_routes_reject_operator_with_legacy_forbidden_shape() {
    let app = build_router(operator_state());
    let token = login_token(app.clone(), "operator").await;

    for (method, uri, body) in [
        (
            "POST",
            "/api/users",
            r#"{"name":"u","password":"p","roleId":2}"#,
        ),
        ("POST", "/api/company", r#"{"name":"跨越速运"}"#),
        (
            "POST",
            "/api/order",
            r#"{"oddnumber":"YD1","consignee":"收","consignor":"发"}"#,
        ),
        ("POST", "/api/role", r#"{"name":"财务","intro":"部分权限"}"#),
        (
            "POST",
            "/api/menu",
            r#"{"name":"新菜单","type":1,"url":"/main/new","parentId":0}"#,
        ),
        ("PATCH", "/api/receipt/1", r#"{"issuestate":"已接收"}"#),
    ] {
        let (status, json) = json_request(app.clone(), method, uri, Some(&token), body).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{uri}");
        assert_eq!(json["code"], -403, "{uri}");
        assert_eq!(json["message"], "没有权限执行该操作", "{uri}");
    }
}

#[tokio::test]
async fn self_or_admin_password_policy_is_centralized() {
    let operator_app = build_router(operator_state());
    let operator_token = login_token(operator_app.clone(), "operator").await;

    let (self_status, self_json) = json_request(
        operator_app.clone(),
        "PATCH",
        "/api/users/59/password",
        Some(&operator_token),
        r#"{"password":"self-secret"}"#,
    )
    .await;
    assert_eq!(self_status, StatusCode::OK);
    assert_eq!(self_json["code"], 0);

    let (other_status, other_json) = json_request(
        operator_app,
        "PATCH",
        "/api/users/58/password",
        Some(&operator_token),
        r#"{"password":"other-secret"}"#,
    )
    .await;
    assert_eq!(other_status, StatusCode::FORBIDDEN);
    assert_eq!(other_json["code"], -403);

    let admin_app = build_router(admin_state());
    let admin_token = login_token(admin_app.clone(), "admin").await;
    let (admin_status, admin_json) = json_request(
        admin_app,
        "PATCH",
        "/api/users/59/password",
        Some(&admin_token),
        r#"{"password":"admin-secret"}"#,
    )
    .await;
    assert_eq!(admin_status, StatusCode::OK);
    assert_eq!(admin_json["code"], 0);
}

#[tokio::test]
async fn public_avatar_route_stays_unauthenticated() {
    let app = build_router(admin_state());
    let avatar_dir = Path::new("tmp/avatars");
    tokio::fs::create_dir_all(avatar_dir)
        .await
        .expect("avatar dir should exist");
    tokio::fs::write(avatar_dir.join("default.jpg"), b"default-avatar")
        .await
        .expect("default avatar should write");

    let (status, body) = empty_get(app, "/api/users/58/avatar", None).await;

    assert_eq!(status, StatusCode::OK);
    assert!(!body.is_empty());
}

#[tokio::test]
async fn api_and_legacy_prefixes_share_the_same_auth_policy() {
    let app = build_router(operator_state());
    let token = login_token(app.clone(), "operator").await;

    let (api_status, api_json) = json_request(
        app.clone(),
        "POST",
        "/api/company",
        Some(&token),
        r#"{"name":"跨越速运"}"#,
    )
    .await;
    let (legacy_status, legacy_json) = json_request(
        app,
        "POST",
        "/company",
        Some(&token),
        r#"{"name":"跨越速运"}"#,
    )
    .await;

    assert_eq!(api_status, StatusCode::FORBIDDEN);
    assert_eq!(legacy_status, StatusCode::FORBIDDEN);
    assert_eq!(api_json["code"], legacy_json["code"]);
    assert_eq!(api_json["message"], legacy_json["message"]);
}

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

fn admin_state() -> AppState {
    let config = AppConfig::from_env().expect("config should load");
    let store = Arc::new(InMemoryAuthUserStore::new([
        AuthUser::with_legacy_md5_password(58, "admin", "secret").with_role_ids([1]),
    ]));
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

async fn get_json(
    app: axum::Router,
    uri: &str,
    token: Option<&str>,
) -> (StatusCode, serde_json::Value) {
    let mut builder = Request::builder().method("GET").uri(uri);
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
        .expect("body should be readable");
    let json: serde_json::Value = serde_json::from_slice(&body).expect("body should be JSON");
    (status, json)
}

#[tokio::test]
async fn admin_resources_require_login() {
    let app = build_router(admin_state());

    let (status, json) = get_json(app, "/api/admin/resources", None).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(json["code"], -200);
    assert_eq!(json["message"], "未登录或登录已失效");
}

#[tokio::test]
async fn admin_resources_return_live_counts_and_registry_shape() {
    let app = build_router(admin_state());
    let token = login_token(app.clone()).await;

    let (status, json) = get_json(app, "/api/admin/resources", Some(&token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], 0);
    let resources = json["data"].as_array().expect("data should be an array");
    assert_eq!(resources.len(), 6);

    let keys = resources
        .iter()
        .map(|resource| resource["key"].as_str().expect("key should be string"))
        .collect::<Vec<_>>();
    assert_eq!(
        keys,
        vec!["orders", "receipts", "companies", "users", "roles", "menus"]
    );

    let orders = resources
        .iter()
        .find(|resource| resource["key"] == "orders")
        .expect("orders resource should exist");
    assert_eq!(orders["title"], "订单管理");
    assert_eq!(orders["count"], 2);
    assert_eq!(orders["status"], "ready");
    assert_eq!(orders["apiPath"], "/order/list");
    assert_eq!(orders["legacyPath"], "adminYh/src/views/orders");
    assert_eq!(orders["owner"], "业务前台");

    let receipts = resources
        .iter()
        .find(|resource| resource["key"] == "receipts")
        .expect("receipts resource should exist");
    assert_eq!(receipts["count"], 2);

    let companies = resources
        .iter()
        .find(|resource| resource["key"] == "companies")
        .expect("companies resource should exist");
    assert!(
        companies["count"]
            .as_u64()
            .expect("company count should be numeric")
            >= 1
    );

    let menus = resources
        .iter()
        .find(|resource| resource["key"] == "menus")
        .expect("menus resource should exist");
    assert!(
        menus["count"]
            .as_u64()
            .expect("menu count should be numeric")
            >= 1
    );
}

#[tokio::test]
async fn legacy_admin_resources_route_keeps_same_shape() {
    let app = build_router(admin_state());
    let token = login_token(app.clone()).await;

    let (status, json) = get_json(app, "/admin/resources", Some(&token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], 0);
    assert_eq!(json["data"][0]["key"], "orders");
    assert_eq!(json["data"][0]["apiPath"], "/order/list");
}

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
async fn chart_header_list_keeps_legacy_shape_and_labels() {
    let app = build_router(admin_state());
    let token = login_token(app.clone()).await;

    let (status, json) = get_json(app, "/api/chart/headerList", Some(&token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], 0);
    assert_eq!(json["data"][0]["amount"], "ordercount");
    assert_eq!(json["data"][0]["title"], "订单总数量:");
    assert_eq!(json["data"][0]["number1"], 2);
    assert_eq!(json["data"][1]["amount"], "orderfreight");
    assert_eq!(json["data"][1]["number1"], 220);
    assert_eq!(json["data"][3]["amount"], "receiptcount");
    assert_eq!(json["data"][3]["number2"], 2);
}

#[tokio::test]
async fn chart_company_aggregates_keep_old_field_names() {
    let app = build_router(admin_state());
    let token = login_token(app.clone()).await;

    let (_, counts) = get_json(app.clone(), "/api/chart/company/order/count", Some(&token)).await;
    assert_eq!(counts["data"][0]["name"], "顺丰速运");
    assert_eq!(counts["data"][0]["ordercount"], 1);

    let (_, freights) = get_json(
        app.clone(),
        "/api/chart/company/order/sumfreight",
        Some(&token),
    )
    .await;
    assert_eq!(freights["data"][1]["name"], "德邦物流");
    assert_eq!(freights["data"][1]["sumfreight"], 110);

    let (_, receipts) = get_json(app, "/api/chart/company/receipt/sumreceipt", Some(&token)).await;
    assert_eq!(receipts["data"][0]["sumReceipt"], 1);
    assert_eq!(receipts["data"][1]["sumReceipt"], 0);
}

#[tokio::test]
async fn chart_routes_reject_missing_token_with_legacy_shape() {
    let app = build_router(admin_state());

    let (status, json) = get_json(app, "/api/chart/headerList", None).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(json["code"], -200);
    assert_eq!(json["message"], "未登录或登录已失效");
}

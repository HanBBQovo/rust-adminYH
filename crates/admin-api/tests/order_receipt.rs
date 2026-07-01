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
async fn order_list_returns_legacy_shape_and_filters() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (status, json) = json_request(
        app,
        "POST",
        "/api/order/list",
        Some(&token),
        r#"{"offset":0,"size":10,"oddnumber":"YD202601","consignee":"张","company":"顺丰","createAt":["2026-01-01","2026-01-31"]}"#,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["code"], 0);
    assert_eq!(json["data"]["totalCount"], 1);
    assert_eq!(json["data"]["list"][0]["oddnumber"], "YD20260101001");
    assert_eq!(json["data"]["list"][0]["billingAt"], "2026-01-01");
}

#[tokio::test]
async fn admin_can_create_order_and_receipt_side_effect() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (_, created) = json_request(
        app.clone(),
        "POST",
        "/api/order",
        Some(&token),
        r#"{"oddnumber":"YD20260701001","billingAt":"2026-07-01","consignee":"新收货人","consigneephone":"","address":"新地址","method":"送货","goodsname":"设备","number":"2","pack":"木箱","weight":"20","measurement":"1","cainsurance":"否","value":"","insurance":"","consignor":"新发货人","consignorphone":"","freight":"100","delivery":"20","sumfreight":"120","freightstate":"现付","paynow":"120","paygo":"","payback":"","paymonth":"","receiptnum":1,"company":"顺丰速运","remarks":""}"#,
    )
    .await;
    assert_eq!(created["code"], 0);
    assert_eq!(created["message"], "创建订单成功！");

    let (_, receipt_list) = json_request(
        app.clone(),
        "POST",
        "/api/receipt/list",
        Some(&token),
        r#"{"offset":0,"size":10,"oddnumber":"YD20260701001","recoverystate":"未回收"}"#,
    )
    .await;
    assert_eq!(receipt_list["data"]["totalCount"], 1);
    assert_eq!(receipt_list["data"]["list"][0]["recoverynumber"], 1);

    let (_, detail) = json_request(app, "GET", "/api/order/3", Some(&token), "").await;
    assert_eq!(detail["data"]["oddnumber"], "YD20260701001");
    assert_eq!(detail["data"]["billingAt"], "2026-07-01");
}

#[tokio::test]
async fn memory_list_keeps_old_data_only_shape_and_order_side_effect() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (_, before) = json_request(app.clone(), "POST", "/api/memory/list", Some(&token), "").await;
    assert!(before["code"].is_null());
    assert!(before["data"]
        .as_array()
        .expect("memory data should be array")
        .iter()
        .any(|record| record["value"] == "张三"));

    let _ = json_request(
        app.clone(),
        "POST",
        "/api/order",
        Some(&token),
        r#"{"oddnumber":"YD20260701002","billingAt":"2026-07-01","consignee":"自动补全收货人","consignor":"自动补全发货人","receiptnum":0}"#,
    )
    .await;

    let (_, after) = json_request(app, "POST", "/api/memory/list", Some(&token), "").await;
    let memory_values = after["data"]
        .as_array()
        .expect("memory data should be array");
    assert!(memory_values
        .iter()
        .any(|record| record["value"] == "自动补全收货人"));
    assert!(memory_values
        .iter()
        .any(|record| record["value"] == "自动补全发货人"));
}

#[tokio::test]
async fn order_writes_require_admin_role() {
    let app = build_router(operator_state());
    let token = login_token(app.clone(), "operator").await;

    let (status, json) = json_request(
        app,
        "POST",
        "/api/order",
        Some(&token),
        r#"{"oddnumber":"YD20260701001","consignee":"新收货人","consignor":"新发货人"}"#,
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(json["code"], -403);
    assert_eq!(json["message"], "没有权限执行该操作");
}

#[tokio::test]
async fn receipt_lists_and_status_update_keep_legacy_messages() {
    let app = build_router(admin_state());
    let token = login_token(app.clone(), "admin").await;

    let (_, not_recovery) = json_request(
        app.clone(),
        "POST",
        "/api/notrecovery/list",
        Some(&token),
        r#"{"offset":0,"size":10,"oddnumber":"YD20260101001"}"#,
    )
    .await;
    assert_eq!(not_recovery["code"], 0);
    assert_eq!(not_recovery["data"]["totalCount"], 1);
    assert_eq!(not_recovery["data"]["list"][0]["recoverystate"], "未回收");

    let (_, updated) = json_request(
        app.clone(),
        "PATCH",
        "/api/receipt/1",
        Some(&token),
        r#"{"recoverystate":"已回收","issuestate":"已接收"}"#,
    )
    .await;
    assert_eq!(updated["code"], 0);
    assert_eq!(updated["message"], "回单回收成功！");

    let (_, recovery) = json_request(
        app.clone(),
        "POST",
        "/api/recovery/list",
        Some(&token),
        r#"{"offset":0,"size":10,"oddnumber":"YD20260101001"}"#,
    )
    .await;
    assert_eq!(recovery["data"]["totalCount"], 1);

    let (_, issue_updated) = json_request(
        app.clone(),
        "PATCH",
        "/api/receipt/1",
        Some(&token),
        r#"{"issuestate":"已接收"}"#,
    )
    .await;
    assert_eq!(issue_updated["code"], 0);
    assert_eq!(issue_updated["message"], "回单发放成功！");

    let (_, receipt_list) = json_request(
        app,
        "POST",
        "/api/receipt/list",
        Some(&token),
        r#"{"offset":0,"size":10,"oddnumber":"YD20260101001","issuestate":"已接收"}"#,
    )
    .await;
    assert_eq!(receipt_list["data"]["totalCount"], 1);
    assert_eq!(receipt_list["data"]["list"][0]["issuestate"], "已接收");
}

#[tokio::test]
async fn order_and_receipt_lists_reject_missing_token() {
    let app = build_router(admin_state());

    let (status, json) = json_request(
        app.clone(),
        "POST",
        "/api/order/list",
        None,
        r#"{"offset":0,"size":10}"#,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(json["code"], -200);

    let (status, json) = json_request(
        app,
        "POST",
        "/api/receipt/list",
        None,
        r#"{"offset":0,"size":10}"#,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(json["message"], "未登录或登录已失效");
}

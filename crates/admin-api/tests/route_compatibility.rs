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

struct RouteSpec {
    label: &'static str,
    method: &'static str,
    legacy_doc_path: &'static str,
    api_doc_path: &'static str,
    legacy_route_path: &'static str,
    api_route_path: &'static str,
}

const DOCUMENTED_ROUTES: &[RouteSpec] = &[
    RouteSpec {
        label: "login",
        method: "POST",
        legacy_doc_path: "/login",
        api_doc_path: "/api/login",
        legacy_route_path: "/login",
        api_route_path: "/api/login",
    },
    RouteSpec {
        label: "code",
        method: "GET",
        legacy_doc_path: "/code",
        api_doc_path: "/api/code",
        legacy_route_path: "/code",
        api_route_path: "/api/code",
    },
    RouteSpec {
        label: "users create",
        method: "POST",
        legacy_doc_path: "/users",
        api_doc_path: "/api/users",
        legacy_route_path: "/users",
        api_route_path: "/api/users",
    },
    RouteSpec {
        label: "users list",
        method: "POST",
        legacy_doc_path: "/users/list",
        api_doc_path: "/api/users/list",
        legacy_route_path: "/users/list",
        api_route_path: "/api/users/list",
    },
    RouteSpec {
        label: "users detail",
        method: "GET",
        legacy_doc_path: "/users/:userId",
        api_doc_path: "/api/users/:userId",
        legacy_route_path: "/users/{user_id}",
        api_route_path: "/api/users/{user_id}",
    },
    RouteSpec {
        label: "users password",
        method: "PATCH",
        legacy_doc_path: "/users/:userId/password",
        api_doc_path: "/api/users/:userId/password",
        legacy_route_path: "/users/{user_id}/password",
        api_route_path: "/api/users/{user_id}/password",
    },
    RouteSpec {
        label: "users avatar",
        method: "GET",
        legacy_doc_path: "/users/:userId/avatar",
        api_doc_path: "/api/users/:userId/avatar",
        legacy_route_path: "/users/{user_id}/avatar",
        api_route_path: "/api/users/{user_id}/avatar",
    },
    RouteSpec {
        label: "upload avatar",
        method: "POST",
        legacy_doc_path: "/upload/avatar",
        api_doc_path: "/api/upload/avatar",
        legacy_route_path: "/upload/avatar",
        api_route_path: "/api/upload/avatar",
    },
    RouteSpec {
        label: "role create",
        method: "POST",
        legacy_doc_path: "/role",
        api_doc_path: "/api/role",
        legacy_route_path: "/role",
        api_route_path: "/api/role",
    },
    RouteSpec {
        label: "role list",
        method: "POST",
        legacy_doc_path: "/role/list",
        api_doc_path: "/api/role/list",
        legacy_route_path: "/role/list",
        api_route_path: "/api/role/list",
    },
    RouteSpec {
        label: "role assign",
        method: "POST",
        legacy_doc_path: "/role/assign",
        api_doc_path: "/api/role/assign",
        legacy_route_path: "/role/assign",
        api_route_path: "/api/role/assign",
    },
    RouteSpec {
        label: "role detail",
        method: "GET",
        legacy_doc_path: "/role/:roleId",
        api_doc_path: "/api/role/:roleId",
        legacy_route_path: "/role/{role_id}",
        api_route_path: "/api/role/{role_id}",
    },
    RouteSpec {
        label: "role menu",
        method: "GET",
        legacy_doc_path: "/role/:roleId/menu",
        api_doc_path: "/api/role/:roleId/menu",
        legacy_route_path: "/role/{role_id}/menu",
        api_route_path: "/api/role/{role_id}/menu",
    },
    RouteSpec {
        label: "role menu ids",
        method: "GET",
        legacy_doc_path: "/role/:roleId/menuIds",
        api_doc_path: "/api/role/:roleId/menuIds",
        legacy_route_path: "/role/{role_id}/menuIds",
        api_route_path: "/api/role/{role_id}/menuIds",
    },
    RouteSpec {
        label: "menu create",
        method: "POST",
        legacy_doc_path: "/menu",
        api_doc_path: "/api/menu",
        legacy_route_path: "/menu",
        api_route_path: "/api/menu",
    },
    RouteSpec {
        label: "menu tree",
        method: "GET",
        legacy_doc_path: "/menu/tree",
        api_doc_path: "/api/menu/tree",
        legacy_route_path: "/menu/tree",
        api_route_path: "/api/menu/tree",
    },
    RouteSpec {
        label: "chart header",
        method: "GET",
        legacy_doc_path: "/chart/headerList",
        api_doc_path: "/api/chart/headerList",
        legacy_route_path: "/chart/headerList",
        api_route_path: "/api/chart/headerList",
    },
    RouteSpec {
        label: "chart order count",
        method: "GET",
        legacy_doc_path: "/chart/company/order/count",
        api_doc_path: "/api/chart/company/order/count",
        legacy_route_path: "/chart/company/order/count",
        api_route_path: "/api/chart/company/order/count",
    },
    RouteSpec {
        label: "chart order freight",
        method: "GET",
        legacy_doc_path: "/chart/company/order/sumfreight",
        api_doc_path: "/api/chart/company/order/sumfreight",
        legacy_route_path: "/chart/company/order/sumfreight",
        api_route_path: "/api/chart/company/order/sumfreight",
    },
    RouteSpec {
        label: "chart receipt sum",
        method: "GET",
        legacy_doc_path: "/chart/company/receipt/sumreceipt",
        api_doc_path: "/api/chart/company/receipt/sumreceipt",
        legacy_route_path: "/chart/company/receipt/sumreceipt",
        api_route_path: "/api/chart/company/receipt/sumreceipt",
    },
    RouteSpec {
        label: "company create",
        method: "POST",
        legacy_doc_path: "/company",
        api_doc_path: "/api/company",
        legacy_route_path: "/company",
        api_route_path: "/api/company",
    },
    RouteSpec {
        label: "company list",
        method: "POST",
        legacy_doc_path: "/company/list",
        api_doc_path: "/api/company/list",
        legacy_route_path: "/company/list",
        api_route_path: "/api/company/list",
    },
    RouteSpec {
        label: "company detail",
        method: "GET",
        legacy_doc_path: "/company/:companyId",
        api_doc_path: "/api/company/:companyId",
        legacy_route_path: "/company/{company_id}",
        api_route_path: "/api/company/{company_id}",
    },
    RouteSpec {
        label: "order create",
        method: "POST",
        legacy_doc_path: "/order",
        api_doc_path: "/api/order",
        legacy_route_path: "/order",
        api_route_path: "/api/order",
    },
    RouteSpec {
        label: "order list",
        method: "POST",
        legacy_doc_path: "/order/list",
        api_doc_path: "/api/order/list",
        legacy_route_path: "/order/list",
        api_route_path: "/api/order/list",
    },
    RouteSpec {
        label: "order detail",
        method: "GET",
        legacy_doc_path: "/order/:orderId",
        api_doc_path: "/api/order/:orderId",
        legacy_route_path: "/order/{order_id}",
        api_route_path: "/api/order/{order_id}",
    },
    RouteSpec {
        label: "receipt list",
        method: "POST",
        legacy_doc_path: "/receipt/list",
        api_doc_path: "/api/receipt/list",
        legacy_route_path: "/receipt/list",
        api_route_path: "/api/receipt/list",
    },
    RouteSpec {
        label: "receipt update",
        method: "PATCH",
        legacy_doc_path: "/receipt/:receiptId",
        api_doc_path: "/api/receipt/:receiptId",
        legacy_route_path: "/receipt/{receipt_id}",
        api_route_path: "/api/receipt/{receipt_id}",
    },
    RouteSpec {
        label: "not recovery",
        method: "POST",
        legacy_doc_path: "/notrecovery/list",
        api_doc_path: "/api/notrecovery/list",
        legacy_route_path: "/notrecovery/list",
        api_route_path: "/api/notrecovery/list",
    },
    RouteSpec {
        label: "recovery",
        method: "POST",
        legacy_doc_path: "/recovery/list",
        api_doc_path: "/api/recovery/list",
        legacy_route_path: "/recovery/list",
        api_route_path: "/api/recovery/list",
    },
    RouteSpec {
        label: "memory list",
        method: "POST",
        legacy_doc_path: "/memory/list",
        api_doc_path: "/api/memory/list",
        legacy_route_path: "/memory/list",
        api_route_path: "/api/memory/list",
    },
    RouteSpec {
        label: "admin resources",
        method: "GET",
        legacy_doc_path: "/admin/resources",
        api_doc_path: "/api/admin/resources",
        legacy_route_path: "/admin/resources",
        api_route_path: "/api/admin/resources",
    },
];

struct AuthParityCase {
    label: &'static str,
    method: &'static str,
    legacy_uri: &'static str,
    api_uri: &'static str,
    body: &'static str,
}

const AUTH_PARITY_CASES: &[AuthParityCase] = &[
    AuthParityCase {
        label: "users me",
        method: "GET",
        legacy_uri: "/users/me",
        api_uri: "/api/users/me",
        body: "",
    },
    AuthParityCase {
        label: "users list",
        method: "POST",
        legacy_uri: "/users/list",
        api_uri: "/api/users/list",
        body: r#"{"offset":0,"size":1}"#,
    },
    AuthParityCase {
        label: "users create",
        method: "POST",
        legacy_uri: "/users",
        api_uri: "/api/users",
        body: r#"{"name":"u","password":"p","roleId":2}"#,
    },
    AuthParityCase {
        label: "users update",
        method: "PATCH",
        legacy_uri: "/users/59",
        api_uri: "/api/users/59",
        body: r#"{"name":"operator","roleId":2}"#,
    },
    AuthParityCase {
        label: "users remove",
        method: "DELETE",
        legacy_uri: "/users/59",
        api_uri: "/api/users/59",
        body: "",
    },
    AuthParityCase {
        label: "users password",
        method: "PATCH",
        legacy_uri: "/users/59/password",
        api_uri: "/api/users/59/password",
        body: r#"{"password":"new-secret"}"#,
    },
    AuthParityCase {
        label: "role list",
        method: "POST",
        legacy_uri: "/role/list",
        api_uri: "/api/role/list",
        body: r#"{"offset":0,"size":1}"#,
    },
    AuthParityCase {
        label: "role assign",
        method: "POST",
        legacy_uri: "/role/assign",
        api_uri: "/api/role/assign",
        body: r#"{"roleId":2,"menuList":[1]}"#,
    },
    AuthParityCase {
        label: "menu tree",
        method: "GET",
        legacy_uri: "/menu/tree",
        api_uri: "/api/menu/tree",
        body: "",
    },
    AuthParityCase {
        label: "chart header",
        method: "GET",
        legacy_uri: "/chart/headerList",
        api_uri: "/api/chart/headerList",
        body: "",
    },
    AuthParityCase {
        label: "company list",
        method: "POST",
        legacy_uri: "/company/list",
        api_uri: "/api/company/list",
        body: r#"{"offset":0,"size":1}"#,
    },
    AuthParityCase {
        label: "company create",
        method: "POST",
        legacy_uri: "/company",
        api_uri: "/api/company",
        body: r#"{"name":"跨越速运"}"#,
    },
    AuthParityCase {
        label: "order list",
        method: "POST",
        legacy_uri: "/order/list",
        api_uri: "/api/order/list",
        body: r#"{"offset":0,"size":1}"#,
    },
    AuthParityCase {
        label: "order create",
        method: "POST",
        legacy_uri: "/order",
        api_uri: "/api/order",
        body: r#"{"oddnumber":"YD1","consignee":"收","consignor":"发"}"#,
    },
    AuthParityCase {
        label: "receipt list",
        method: "POST",
        legacy_uri: "/receipt/list",
        api_uri: "/api/receipt/list",
        body: r#"{"offset":0,"size":1}"#,
    },
    AuthParityCase {
        label: "receipt update",
        method: "PATCH",
        legacy_uri: "/receipt/1",
        api_uri: "/api/receipt/1",
        body: r#"{"recoverystate":"已回收"}"#,
    },
    AuthParityCase {
        label: "memory list",
        method: "POST",
        legacy_uri: "/memory/list",
        api_uri: "/api/memory/list",
        body: "",
    },
    AuthParityCase {
        label: "admin resources",
        method: "GET",
        legacy_uri: "/admin/resources",
        api_uri: "/api/admin/resources",
        body: "",
    },
];

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
    let json: serde_json::Value = serde_json::from_slice(&body)
        .unwrap_or_else(|err| panic!("{method} {uri} should return JSON: {err}"));

    (status, json)
}

#[test]
fn documented_route_matrix_is_registered_in_router() {
    let docs = include_str!("../../../docs/api-compatibility.md");
    let routes = include_str!("../src/routes/mod.rs");

    for spec in DOCUMENTED_ROUTES {
        assert!(
            docs.contains(&format!("`{}`", spec.legacy_doc_path)),
            "{} missing legacy path {} in api compatibility docs",
            spec.label,
            spec.legacy_doc_path
        );
        assert!(
            docs.contains(&format!("`{}`", spec.api_doc_path)),
            "{} missing api path {} in api compatibility docs",
            spec.label,
            spec.api_doc_path
        );
        assert!(
            routes.contains(&format!("\"{}\"", spec.legacy_route_path)),
            "{} missing legacy route {} in router",
            spec.label,
            spec.legacy_route_path
        );
        assert!(
            routes.contains(&format!("\"{}\"", spec.api_route_path)),
            "{} missing api route {} in router",
            spec.label,
            spec.api_route_path
        );
        assert!(
            ["GET", "POST", "PATCH", "DELETE"].contains(&spec.method),
            "{} has unsupported method {}",
            spec.label,
            spec.method
        );
    }
}

#[tokio::test]
async fn legacy_and_api_paths_share_missing_auth_envelopes() {
    let app = build_router(admin_state());

    for case in AUTH_PARITY_CASES {
        let (legacy_status, legacy_json) =
            json_request(app.clone(), case.method, case.legacy_uri, None, case.body).await;
        let (api_status, api_json) =
            json_request(app.clone(), case.method, case.api_uri, None, case.body).await;

        assert_eq!(legacy_status, StatusCode::UNAUTHORIZED, "{}", case.label);
        assert_eq!(api_status, legacy_status, "{}", case.label);
        assert_eq!(api_json["code"], legacy_json["code"], "{}", case.label);
        assert_eq!(
            api_json["message"], legacy_json["message"],
            "{}",
            case.label
        );
        assert_eq!(api_json["data"], legacy_json["data"], "{}", case.label);
    }
}

#[tokio::test]
async fn public_legacy_and_api_paths_share_data_only_shapes() {
    let app = build_router(admin_state());

    let (legacy_code_status, legacy_code_json) =
        json_request(app.clone(), "GET", "/code", None, "").await;
    let (api_code_status, api_code_json) = json_request(app, "GET", "/api/code", None, "").await;

    assert_eq!(legacy_code_status, StatusCode::OK);
    assert_eq!(api_code_status, StatusCode::OK);
    assert!(legacy_code_json["data"]
        .as_str()
        .expect("legacy code data should be a string")
        .starts_with("<svg"));
    assert!(api_code_json["data"]
        .as_str()
        .expect("api code data should be a string")
        .starts_with("<svg"));
    assert!(legacy_code_json["code"].is_null());
    assert!(api_code_json["code"].is_null());
    assert!(legacy_code_json["message"].is_null());
    assert!(api_code_json["message"].is_null());
}

#[tokio::test]
async fn login_legacy_and_api_paths_share_error_envelope() {
    let app = build_router(admin_state());

    let (legacy_status, legacy_json) = json_request(
        app.clone(),
        "POST",
        "/login",
        None,
        r#"{"name":"admin","password":"wrong"}"#,
    )
    .await;
    let (api_status, api_json) = json_request(
        app,
        "POST",
        "/api/login",
        None,
        r#"{"name":"admin","password":"wrong"}"#,
    )
    .await;

    assert_eq!(legacy_status, StatusCode::OK);
    assert_eq!(api_status, legacy_status);
    assert_eq!(api_json["code"], legacy_json["code"]);
    assert_eq!(api_json["message"], legacy_json["message"]);
    assert_eq!(api_json["data"], legacy_json["data"]);
}

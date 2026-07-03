use axum::{
    http::{HeaderName, HeaderValue},
    routing::{get, post},
    Router,
};
use tower_http::{
    cors::{AllowOrigin, Any, CorsLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    trace::TraceLayer,
};

use crate::{
    config::CorsOrigins,
    handlers::{auth, chart, company, health, memory, menu, order, receipt, resources, role, user},
    AppState,
};

pub fn build_router(state: AppState) -> Router {
    let request_id_header: HeaderName = state
        .config
        .http
        .request_id_header
        .parse()
        .expect("request id header config must be a valid HTTP header name");
    let cors = cors_layer(&state.config.http.cors_origins);

    Router::new()
        .route("/health", get(health::health_check))
        .route("/api/health", get(health::health_check))
        .route("/login", post(auth::login))
        .route("/api/login", post(auth::login))
        .route("/code", get(auth::code))
        .route("/api/code", get(auth::code))
        .route("/users/me", get(auth::me))
        .route("/api/users/me", get(auth::me))
        .route("/admin/resources", get(resources::list))
        .route("/api/admin/resources", get(resources::list))
        .route("/users", post(user::create))
        .route("/api/users", post(user::create))
        .route("/users/list", post(user::list))
        .route("/api/users/list", post(user::list))
        .route(
            "/users/{user_id}",
            get(user::detail).patch(user::update).delete(user::remove),
        )
        .route(
            "/api/users/{user_id}",
            get(user::detail).patch(user::update).delete(user::remove),
        )
        .route(
            "/users/{user_id}/password",
            axum::routing::patch(user::update_password),
        )
        .route(
            "/api/users/{user_id}/password",
            axum::routing::patch(user::update_password),
        )
        .route("/users/{user_id}/avatar", get(user::avatar))
        .route("/api/users/{user_id}/avatar", get(user::avatar))
        .route("/upload/avatar", post(user::upload_avatar))
        .route("/api/upload/avatar", post(user::upload_avatar))
        .route("/role", post(role::create))
        .route("/api/role", post(role::create))
        .route("/role/list", post(role::list))
        .route("/api/role/list", post(role::list))
        .route("/role/assign", post(role::assign))
        .route("/api/role/assign", post(role::assign))
        .route(
            "/role/{role_id}",
            get(role::detail).patch(role::update).delete(role::remove),
        )
        .route(
            "/api/role/{role_id}",
            get(role::detail).patch(role::update).delete(role::remove),
        )
        .route("/role/{role_id}/menu", get(menu::role_menu))
        .route("/api/role/{role_id}/menu", get(menu::role_menu))
        .route("/role/{role_id}/menuIds", get(menu::role_menu_ids))
        .route("/api/role/{role_id}/menuIds", get(menu::role_menu_ids))
        .route("/menu", post(menu::create))
        .route("/api/menu", post(menu::create))
        .route(
            "/menu/{menu_id}",
            get(menu::detail).patch(menu::update).delete(menu::remove),
        )
        .route(
            "/api/menu/{menu_id}",
            get(menu::detail).patch(menu::update).delete(menu::remove),
        )
        .route("/menu/tree", get(menu::menu_tree))
        .route("/api/menu/tree", get(menu::menu_tree))
        .route("/chart/headerList", get(chart::header_list))
        .route("/api/chart/headerList", get(chart::header_list))
        .route(
            "/chart/company/order/count",
            get(chart::company_order_count),
        )
        .route(
            "/api/chart/company/order/count",
            get(chart::company_order_count),
        )
        .route(
            "/chart/company/order/sumfreight",
            get(chart::company_order_sumfreight),
        )
        .route(
            "/api/chart/company/order/sumfreight",
            get(chart::company_order_sumfreight),
        )
        .route(
            "/chart/company/receipt/sumreceipt",
            get(chart::company_receipt_sumreceipt),
        )
        .route(
            "/api/chart/company/receipt/sumreceipt",
            get(chart::company_receipt_sumreceipt),
        )
        .route("/order", post(order::create))
        .route("/api/order", post(order::create))
        .route("/order/list", post(order::list))
        .route("/api/order/list", post(order::list))
        .route(
            "/order/{order_id}",
            get(order::detail)
                .patch(order::update)
                .delete(order::remove),
        )
        .route(
            "/api/order/{order_id}",
            get(order::detail)
                .patch(order::update)
                .delete(order::remove),
        )
        .route("/receipt/list", post(receipt::list))
        .route("/api/receipt/list", post(receipt::list))
        .route(
            "/receipt/batch/status",
            axum::routing::patch(receipt::update_statuses),
        )
        .route(
            "/api/receipt/batch/status",
            axum::routing::patch(receipt::update_statuses),
        )
        .route(
            "/receipt/{receipt_id}",
            axum::routing::patch(receipt::update_status),
        )
        .route(
            "/api/receipt/{receipt_id}",
            axum::routing::patch(receipt::update_status),
        )
        .route("/notrecovery/list", post(receipt::not_recovery))
        .route("/api/notrecovery/list", post(receipt::not_recovery))
        .route("/recovery/list", post(receipt::recovery))
        .route("/api/recovery/list", post(receipt::recovery))
        .route("/memory/list", post(memory::list))
        .route("/api/memory/list", post(memory::list))
        .route("/company", post(company::create))
        .route("/api/company", post(company::create))
        .route(
            "/company/{company_id}",
            get(company::detail)
                .patch(company::update)
                .delete(company::remove),
        )
        .route(
            "/api/company/{company_id}",
            get(company::detail)
                .patch(company::update)
                .delete(company::remove),
        )
        .route("/company/list", post(company::list))
        .route("/api/company/list", post(company::list))
        .with_state(state)
        .layer(PropagateRequestIdLayer::new(request_id_header.clone()))
        .layer(SetRequestIdLayer::new(request_id_header, MakeRequestUuid))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
}

fn cors_layer(origins: &CorsOrigins) -> CorsLayer {
    let allow_origin = match origins {
        CorsOrigins::Any => AllowOrigin::any(),
        CorsOrigins::List(origins) => AllowOrigin::list(origins.iter().map(|origin| {
            origin
                .parse::<HeaderValue>()
                .expect("validated CORS origin must parse as HeaderValue")
        })),
    };

    CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_methods(Any)
        .allow_headers(Any)
}

use axum::{
    http::{HeaderName, HeaderValue},
    routing::{get, post, MethodRouter},
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

    let router = Router::new();
    let router = compat_route(router, "/health", get(health::health_check));
    let router = compat_route(router, "/login", post(auth::login));
    let router = compat_route(router, "/users/me", get(auth::me));
    let router = compat_route(router, "/admin/resources", get(resources::list));
    let router = compat_route(router, "/users", post(user::create));
    let router = compat_route(router, "/users/list", post(user::list));
    let router = compat_route(
        router,
        "/users/{user_id}",
        get(user::detail).patch(user::update).delete(user::remove),
    );
    let router = compat_route(
        router,
        "/users/{user_id}/password",
        axum::routing::patch(user::update_password),
    );
    let router = compat_route(router, "/users/{user_id}/avatar", get(user::avatar));
    let router = compat_route(router, "/upload/avatar", post(user::upload_avatar));
    let router = compat_route(router, "/role", post(role::create));
    let router = compat_route(router, "/role/list", post(role::list));
    let router = compat_route(router, "/role/assign", post(role::assign));
    let router = compat_route(
        router,
        "/role/{role_id}",
        get(role::detail).patch(role::update).delete(role::remove),
    );
    let router = compat_route(router, "/role/{role_id}/menu", get(menu::role_menu));
    let router = compat_route(router, "/role/{role_id}/menuIds", get(menu::role_menu_ids));
    let router = compat_route(router, "/menu", post(menu::create));
    let router = compat_route(
        router,
        "/menu/{menu_id}",
        get(menu::detail).patch(menu::update).delete(menu::remove),
    );
    let router = compat_route(router, "/menu/tree", get(menu::menu_tree));
    let router = compat_route(router, "/chart/headerList", get(chart::header_list));
    let router = compat_route(
        router,
        "/chart/company/order/count",
        get(chart::company_order_count),
    );
    let router = compat_route(
        router,
        "/chart/company/order/sumfreight",
        get(chart::company_order_sumfreight),
    );
    let router = compat_route(
        router,
        "/chart/company/receipt/sumreceipt",
        get(chart::company_receipt_sumreceipt),
    );
    let router = compat_route(router, "/order", post(order::create));
    let router = compat_route(router, "/order/list", post(order::list));
    let router = compat_route(
        router,
        "/order/{order_id}",
        get(order::detail)
            .patch(order::update)
            .delete(order::remove),
    );
    let router = compat_route(router, "/receipt/list", post(receipt::list));
    let router = compat_route(
        router,
        "/receipt/batch/status",
        axum::routing::patch(receipt::update_statuses),
    );
    let router = compat_route(
        router,
        "/receipt/{receipt_id}",
        axum::routing::patch(receipt::update_status),
    );
    let router = compat_route(router, "/notrecovery/list", post(receipt::not_recovery));
    let router = compat_route(router, "/recovery/list", post(receipt::recovery));
    let router = compat_route(router, "/memory/list", post(memory::list));
    let router = compat_route(router, "/company", post(company::create));
    let router = compat_route(
        router,
        "/company/{company_id}",
        get(company::detail)
            .patch(company::update)
            .delete(company::remove),
    );
    let router = compat_route(router, "/company/list", post(company::list));

    router
        .with_state(state)
        .layer(PropagateRequestIdLayer::new(request_id_header.clone()))
        .layer(SetRequestIdLayer::new(request_id_header, MakeRequestUuid))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
}

fn compat_route(
    router: Router<AppState>,
    legacy_path: &'static str,
    method_router: MethodRouter<AppState>,
) -> Router<AppState> {
    let api_path = format!("/api{legacy_path}");
    router
        .route(legacy_path, method_router.clone())
        .route(&api_path, method_router)
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

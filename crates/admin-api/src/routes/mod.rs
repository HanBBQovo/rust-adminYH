use axum::{
    http::HeaderName,
    routing::{get, post},
    Router,
};
use tower_http::{
    cors::{Any, CorsLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    trace::TraceLayer,
};

use crate::{
    handlers::{auth, company, health, menu, user},
    AppState,
};

pub fn build_router(state: AppState) -> Router {
    let request_id_header: HeaderName = state
        .config
        .http
        .request_id_header
        .parse()
        .expect("request id header config must be a valid HTTP header name");

    Router::new()
        .route("/health", get(health::health_check))
        .route("/api/health", get(health::health_check))
        .route("/login", post(auth::login))
        .route("/api/login", post(auth::login))
        .route("/users/me", get(auth::me))
        .route("/api/users/me", get(auth::me))
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
        .route("/role/{role_id}/menu", get(menu::role_menu))
        .route("/api/role/{role_id}/menu", get(menu::role_menu))
        .route("/role/{role_id}/menuIds", get(menu::role_menu_ids))
        .route("/api/role/{role_id}/menuIds", get(menu::role_menu_ids))
        .route("/menu/tree", get(menu::menu_tree))
        .route("/api/menu/tree", get(menu::menu_tree))
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
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
}

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
    handlers::{auth, health},
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

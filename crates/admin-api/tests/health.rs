use admin_api::{build_router, AppConfig, AppState};
use admin_core::services::StaticHealthService;
use axum::body::Body;
use http::{Request, StatusCode};
use tower::ServiceExt;

#[tokio::test]
async fn health_endpoint_returns_legacy_response_shape() {
    let config = AppConfig::from_env().expect("config should load");
    let state = AppState::new(
        config,
        StaticHealthService::new("rust-adminYH", env!("CARGO_PKG_VERSION")),
    );
    let app = build_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("request should succeed");

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body should be readable");
    let json: serde_json::Value = serde_json::from_slice(&body).expect("body should be JSON");

    assert_eq!(json["code"], 0);
    assert_eq!(json["message"], "success");
    assert_eq!(json["data"]["service"], "rust-adminYH");
    assert_eq!(json["data"]["status"], "ok");
}

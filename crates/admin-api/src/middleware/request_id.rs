use axum::{
    http::{HeaderName, HeaderValue, Request},
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

pub static REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

pub async fn ensure_request_id(mut request: Request<axum::body::Body>, next: Next) -> Response {
    let request_id = request
        .headers()
        .get(&REQUEST_ID_HEADER)
        .cloned()
        .unwrap_or_else(|| {
            HeaderValue::from_str(&Uuid::new_v4().to_string()).expect("uuid header")
        });

    request
        .headers_mut()
        .insert(REQUEST_ID_HEADER.clone(), request_id.clone());
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(REQUEST_ID_HEADER.clone(), request_id);
    response
}

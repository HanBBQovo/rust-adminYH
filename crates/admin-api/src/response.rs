use admin_core::{ApiResponse, EmptyResponse};
use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;

pub struct JsonResponse<T>(pub T)
where
    T: Serialize;

impl<T> IntoResponse for JsonResponse<T>
where
    T: Serialize,
{
    fn into_response(self) -> axum::response::Response {
        (StatusCode::OK, Json(ApiResponse::ok(self.0))).into_response()
    }
}

pub struct ErrorResponse(pub admin_core::AppError);

impl From<admin_core::AppError> for ErrorResponse {
    fn from(value: admin_core::AppError) -> Self {
        Self(value)
    }
}

impl IntoResponse for ErrorResponse {
    fn into_response(self) -> axum::response::Response {
        let status = self.0.status_code();
        let body = self.0.error_body();
        (
            status,
            Json(serde_json::json!({
                "code": body.code,
                "data": null,
                "message": body.message,
            })),
        )
            .into_response()
    }
}

pub struct MessageResponse(pub String);

impl IntoResponse for MessageResponse {
    fn into_response(self) -> axum::response::Response {
        (
            StatusCode::OK,
            Json(ApiResponse::with_message(EmptyResponse {}, self.0)),
        )
            .into_response()
    }
}

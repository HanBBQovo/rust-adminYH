use admin_core::{ApiResponse, EmptyResponse};
use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;

pub struct StatusJsonResponse<T> {
    pub status: StatusCode,
    pub data: T,
}

impl<T> StatusJsonResponse<T>
where
    T: Serialize,
{
    pub fn new(status: StatusCode, data: T) -> Self {
        Self { status, data }
    }
}

impl<T> IntoResponse for StatusJsonResponse<T>
where
    T: Serialize,
{
    fn into_response(self) -> axum::response::Response {
        (self.status, Json(ApiResponse::ok(self.data))).into_response()
    }
}

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

#[derive(Serialize)]
struct LegacyDataBody<T>
where
    T: Serialize,
{
    data: T,
}

pub struct LegacyDataResponse<T>(pub T)
where
    T: Serialize;

impl<T> IntoResponse for LegacyDataResponse<T>
where
    T: Serialize,
{
    fn into_response(self) -> axum::response::Response {
        (StatusCode::OK, Json(LegacyDataBody { data: self.0 })).into_response()
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

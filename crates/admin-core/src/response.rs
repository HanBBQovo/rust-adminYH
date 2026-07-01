use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ApiResponse<T>
where
    T: Serialize,
{
    pub code: i32,
    pub data: T,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct EmptyResponse {}

impl<T> ApiResponse<T>
where
    T: Serialize,
{
    pub fn ok(data: T) -> Self {
        Self {
            code: 0,
            data,
            message: "success".to_owned(),
        }
    }

    pub fn with_message(data: T, message: impl Into<String>) -> Self {
        Self {
            code: 0,
            data,
            message: message.into(),
        }
    }
}

impl ApiResponse<EmptyResponse> {
    pub fn empty() -> Self {
        Self::ok(EmptyResponse {})
    }
}

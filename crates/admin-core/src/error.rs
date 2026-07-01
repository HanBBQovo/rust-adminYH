use http::StatusCode;
use serde::Serialize;
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("配置错误: {0}")]
    Config(String),
    #[error("数据库错误: {0}")]
    Database(String),
    #[error("请求参数错误: {0}")]
    Validation(String),
    #[error("未登录或登录已失效")]
    Unauthorized,
    #[error("没有权限执行该操作")]
    Forbidden,
    #[error("资源不存在: {0}")]
    NotFound(String),
    #[error("系统内部错误")]
    Internal,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ErrorBody {
    pub code: i32,
    pub message: String,
}

impl AppError {
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::Validation(_) => StatusCode::BAD_REQUEST,
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Config(_) | Self::Database(_) | Self::Internal => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }

    pub fn legacy_code(&self) -> i32 {
        match self {
            Self::Unauthorized => -200,
            Self::Forbidden => -403,
            Self::Validation(_) => -400,
            Self::NotFound(_) => -404,
            Self::Config(_) | Self::Database(_) | Self::Internal => -500,
        }
    }

    pub fn error_body(&self) -> ErrorBody {
        ErrorBody {
            code: self.legacy_code(),
            message: self.to_string(),
        }
    }
}

pub mod auth;
pub mod domain;
pub mod dto;
pub mod error;
pub mod response;
pub mod services;

pub use error::{AppError, AppResult};
pub use response::{ApiResponse, EmptyResponse};

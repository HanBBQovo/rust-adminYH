pub mod auth;
pub mod company;
pub mod health;
pub mod menu;
pub mod user;

pub use auth::{CurrentUserResponse, LoginRequest, LoginResponse};
pub use company::{
    CompanyListRequest, CompanyListResponse, CompanyMutationRequest, LegacyCompanyRecord,
};
pub use health::HealthResponse;
pub use menu::{LegacyMenuNode, RoleMenuIdsResponse};
pub use user::{
    AvatarInfo, LegacyRoleRecord, LegacyUserRecord, UserCreateRequest, UserDetailResponse,
    UserListItemResponse, UserListRequest, UserListResponse, UserPasswordRequest,
    UserUpdateRequest,
};

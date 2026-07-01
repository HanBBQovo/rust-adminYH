pub mod auth;
pub mod company;
pub mod health;
pub mod menu;
pub mod order;
pub mod role;
pub mod user;

pub use auth::{CurrentUserResponse, LoginRequest, LoginResponse};
pub use company::{
    CompanyListRequest, CompanyListResponse, CompanyMutationRequest, LegacyCompanyRecord,
};
pub use health::HealthResponse;
pub use menu::{LegacyMenuNode, RoleMenuIdsResponse};
pub use order::{
    LegacyDateInput, LegacyOrderRecord, LegacyReceiptRecord, MemoryRecord, OrderListRequest,
    OrderListResponse, OrderMutationRequest, ReceiptListRequest, ReceiptListResponse,
    ReceiptStatusRequest,
};
pub use role::{
    LegacyRoleRecord as RoleRecord, RoleAssignRequest, RoleListRequest, RoleListResponse,
    RoleMutationRequest,
};
pub use user::{
    AvatarInfo, LegacyRoleRecord as UserRoleRecord, LegacyUserRecord, UserCreateRequest,
    UserDetailResponse, UserListItemResponse, UserListRequest, UserListResponse,
    UserPasswordRequest, UserUpdateRequest,
};

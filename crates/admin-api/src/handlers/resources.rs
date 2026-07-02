use admin_core::dto::{
    CompanyListRequest, LegacyMenuNode, OrderListRequest, ReceiptListRequest, ResourceSummary,
    RoleListRequest, UserListRequest,
};
use axum::{extract::State, http::HeaderMap};

use crate::{
    middleware::auth::require_auth,
    response::{ErrorResponse, JsonResponse},
    AppState,
};

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<JsonResponse<Vec<ResourceSummary>>, ErrorResponse> {
    require_auth(&state, &headers).await?;

    let orders = state
        .order_service
        .list(OrderListRequest {
            offset: 0,
            size: 0,
            oddnumber: None,
            consignee: None,
            consigneephone: None,
            number: None,
            consignor: None,
            consignorphone: None,
            company: None,
            create_at: None,
        })
        .await?
        .total_count;
    let receipts = state
        .receipt_service
        .list(ReceiptListRequest {
            offset: 0,
            size: 0,
            oddnumber: None,
            consignee: None,
            consignor: None,
            recoverystate: None,
            issuestate: None,
            poststate: None,
            create_at: None,
        })
        .await?
        .total_count;
    let companies = state
        .company_service
        .list(CompanyListRequest { offset: 0, size: 0 })
        .await?
        .total_count;
    let users = state
        .user_service
        .list(UserListRequest {
            offset: 0,
            size: 0,
            name: None,
            enable: None,
            role_id: None,
            create_at: None,
        })
        .await?
        .total_count;
    let roles = state
        .role_service
        .list(RoleListRequest {
            offset: 0,
            size: 0,
            name: None,
            intro: None,
            create_at: None,
        })
        .await?
        .total_count;
    let menus = count_menu_nodes(&state.menu_service.menu_tree().await?);

    Ok(JsonResponse(vec![
        ResourceSummary::ready(
            "orders",
            "订单管理",
            "承运单、货运信息、结算状态",
            orders,
            "/order/list",
            "adminYh/src/views/orders",
            "业务前台",
        ),
        ResourceSummary::ready(
            "receipts",
            "回单管理",
            "未回收、已回收、回单状态追踪",
            receipts,
            "/receipt/list",
            "adminYh/src/views/receipt",
            "业务前台",
        ),
        ResourceSummary::ready(
            "companies",
            "公司档案",
            "承运公司与订单统计",
            companies,
            "/company/list",
            "adminYh/src/views/company",
            "基础资料",
        ),
        ResourceSummary::ready(
            "users",
            "用户管理",
            "账号、角色、启停状态",
            users,
            "/users/list",
            "adminYh/src/views/user",
            "系统设置",
        ),
        ResourceSummary::ready(
            "roles",
            "角色权限",
            "角色、菜单授权、权限树",
            roles,
            "/role/list",
            "adminYh/src/views/role",
            "系统设置",
        ),
        ResourceSummary::ready(
            "menus",
            "菜单资源",
            "侧边栏、路由、权限节点",
            menus,
            "/menu/tree",
            "adminYh/src/router",
            "系统设置",
        ),
    ]))
}

fn count_menu_nodes(nodes: &[LegacyMenuNode]) -> usize {
    nodes
        .iter()
        .map(|node| 1 + count_menu_nodes(&node.children) + count_menu_nodes(&node.legacy_children))
        .sum()
}

use std::collections::HashSet;

use crate::{
    dto::{
        LegacyDateInput, OrderMutationRequest, ReceiptBatchStatusRequest, ReceiptStatusRequest,
        RoleAssignRequest, RoleMutationRequest, UserCreateRequest, UserPasswordRequest,
        UserUpdateRequest,
    },
    services::order::{NormalizedOrderInput, ReceiptStatusChange},
    AppError, AppResult,
};

const RECEIPT_MESSAGE_RECOVERY: &str = "回单回收成功！";
const RECEIPT_MESSAGE_ISSUE: &str = "回单发放成功！";
const RECEIPT_MESSAGE_POST: &str = "回单寄出成功！";

pub fn normalize_order_mutation(input: OrderMutationRequest) -> AppResult<NormalizedOrderInput> {
    let oddnumber = required(input.oddnumber, "运单号不能为空")?;
    Ok(NormalizedOrderInput {
        oddnumber,
        billing_at: input
            .billing_at
            .unwrap_or(LegacyDateInput::Millis(0))
            .as_legacy_millis(),
        consignee: required(input.consignee, "收货人不能为空")?,
        consigneephone: input.consigneephone.unwrap_or_default(),
        address: input.address.unwrap_or_default(),
        method: input.method.unwrap_or_default(),
        goodsname: input.goodsname.unwrap_or_default(),
        number: input.number.unwrap_or_default(),
        pack: input.pack.unwrap_or_default(),
        weight: input.weight.unwrap_or_default(),
        measurement: input.measurement.unwrap_or_default(),
        cainsurance: input.cainsurance.unwrap_or_default(),
        value: input.value.unwrap_or_default(),
        insurance: input.insurance.unwrap_or_default(),
        consignor: required(input.consignor, "发货人不能为空")?,
        consignorphone: input.consignorphone.unwrap_or_default(),
        freight: input.freight.unwrap_or_default(),
        delivery: input.delivery.unwrap_or_default(),
        sumfreight: input.sumfreight.unwrap_or_default(),
        freightstate: input.freightstate.unwrap_or_default(),
        paynow: input.paynow.unwrap_or_default(),
        paygo: input.paygo.unwrap_or_default(),
        payback: input.payback.unwrap_or_default(),
        paymonth: input.paymonth.unwrap_or_default(),
        receiptnum: input.receiptnum.unwrap_or_default(),
        company: input.company.unwrap_or_default(),
        remarks: input.remarks.unwrap_or_default(),
    })
}

pub fn normalize_receipt_status(
    input: ReceiptStatusRequest,
) -> AppResult<(ReceiptStatusChange, &'static str)> {
    if let Some(value) = non_empty(input.recoverystate) {
        return Ok((
            ReceiptStatusChange::Recovery(value),
            RECEIPT_MESSAGE_RECOVERY,
        ));
    }
    if let Some(value) = non_empty(input.issuestate) {
        return Ok((ReceiptStatusChange::Issue(value), RECEIPT_MESSAGE_ISSUE));
    }
    if let Some(value) = non_empty(input.poststate) {
        return Ok((ReceiptStatusChange::Post(value), RECEIPT_MESSAGE_POST));
    }
    Err(AppError::Validation("回单状态不能为空".to_owned()))
}

pub fn normalize_receipt_batch_status(
    input: ReceiptBatchStatusRequest,
) -> AppResult<(Vec<i64>, ReceiptStatusChange, &'static str)> {
    if input.receipt_ids.is_empty() {
        return Err(AppError::Validation("请选择回单".to_owned()));
    }

    let mut seen_ids = HashSet::new();
    for receipt_id in &input.receipt_ids {
        if *receipt_id <= 0 {
            return Err(AppError::Validation("回单 ID 无效".to_owned()));
        }
        if !seen_ids.insert(*receipt_id) {
            return Err(AppError::Validation("回单 ID 不能重复".to_owned()));
        }
    }

    let (change, message) =
        normalize_single_receipt_status(input.recoverystate, input.issuestate, input.poststate)?;
    Ok((input.receipt_ids, change, message))
}

pub fn normalize_user_create(input: UserCreateRequest) -> AppResult<UserCreateRequest> {
    let name = input.name.trim().to_owned();
    if name.is_empty() || input.password.is_empty() {
        return Err(AppError::Validation("用户名或密码不能为空！".to_owned()));
    }
    if input.role_id <= 0 {
        return Err(AppError::Validation("权限角色不能为空！".to_owned()));
    }
    Ok(UserCreateRequest {
        name,
        password: input.password,
        role_id: input.role_id,
    })
}

pub fn normalize_user_update(input: UserUpdateRequest) -> AppResult<UserUpdateRequest> {
    let name = input.name.trim().to_owned();
    if name.is_empty() {
        return Err(AppError::Validation("用户名不能为空！".to_owned()));
    }
    if input.role_id <= 0 {
        return Err(AppError::Validation("权限角色不能为空！".to_owned()));
    }
    Ok(UserUpdateRequest {
        name,
        role_id: input.role_id,
    })
}

pub fn normalize_user_password(input: &UserPasswordRequest) -> AppResult<&str> {
    let password = input.password();
    if password.is_empty() {
        return Err(AppError::Validation("密码不能为空！".to_owned()));
    }
    Ok(password)
}

pub fn normalize_role_mutation(input: RoleMutationRequest) -> AppResult<RoleMutationRequest> {
    let name = input.name.trim().to_owned();
    if name.is_empty() {
        return Err(AppError::Validation("角色名不能为空".to_owned()));
    }
    let intro = input.intro.trim().to_owned();
    if intro.is_empty() {
        return Err(AppError::Validation("权限介绍不能为空".to_owned()));
    }
    Ok(RoleMutationRequest { name, intro })
}

pub fn normalize_role_assignment(input: RoleAssignRequest) -> AppResult<(i64, Vec<i64>)> {
    if input.role_id <= 0 {
        return Err(AppError::Validation("角色不能为空".to_owned()));
    }
    Ok((input.role_id, normalize_menu_ids(input.menu_list)?))
}

fn required(value: Option<String>, message: &str) -> AppResult<String> {
    let value = value.unwrap_or_default().trim().to_owned();
    if value.is_empty() {
        return Err(AppError::Validation(message.to_owned()));
    }
    Ok(value)
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

fn normalize_single_receipt_status(
    recoverystate: Option<String>,
    issuestate: Option<String>,
    poststate: Option<String>,
) -> AppResult<(ReceiptStatusChange, &'static str)> {
    let mut selected: Option<(ReceiptStatusChange, &'static str)> = None;
    let mut selected_count = 0;

    if let Some(value) = non_empty(recoverystate) {
        selected = Some((
            ReceiptStatusChange::Recovery(value),
            RECEIPT_MESSAGE_RECOVERY,
        ));
        selected_count += 1;
    }
    if let Some(value) = non_empty(issuestate) {
        selected = Some((ReceiptStatusChange::Issue(value), RECEIPT_MESSAGE_ISSUE));
        selected_count += 1;
    }
    if let Some(value) = non_empty(poststate) {
        selected = Some((ReceiptStatusChange::Post(value), RECEIPT_MESSAGE_POST));
        selected_count += 1;
    }

    if selected_count > 1 {
        return Err(AppError::Validation("每次只能更新一种回单状态".to_owned()));
    }
    selected.ok_or_else(|| AppError::Validation("回单状态不能为空".to_owned()))
}

fn normalize_menu_ids(menu_ids: Vec<i64>) -> AppResult<Vec<i64>> {
    let mut normalized = Vec::new();
    let mut seen = HashSet::new();
    for menu_id in menu_ids {
        if menu_id <= 0 {
            return Err(AppError::Validation("权限菜单不能为空".to_owned()));
        }
        if seen.insert(menu_id) {
            normalized.push(menu_id);
        }
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_order_mutation, normalize_receipt_batch_status, normalize_receipt_status,
        normalize_role_assignment, normalize_role_mutation, normalize_user_create,
        normalize_user_password, normalize_user_update,
    };
    use crate::{
        dto::{
            OrderMutationRequest, ReceiptBatchStatusRequest, ReceiptStatusRequest,
            RoleAssignRequest, RoleMutationRequest, UserCreateRequest, UserPasswordRequest,
            UserUpdateRequest,
        },
        AppError,
    };

    #[test]
    fn order_mutation_requires_legacy_core_fields() {
        let result = normalize_order_mutation(OrderMutationRequest {
            oddnumber: Some("  ".to_owned()),
            billing_at: None,
            consignee: Some("张三".to_owned()),
            consigneephone: None,
            address: None,
            method: None,
            goodsname: None,
            number: None,
            pack: None,
            weight: None,
            measurement: None,
            cainsurance: None,
            value: None,
            insurance: None,
            consignor: Some("李四".to_owned()),
            consignorphone: None,
            freight: None,
            delivery: None,
            sumfreight: None,
            freightstate: None,
            paynow: None,
            paygo: None,
            payback: None,
            paymonth: None,
            receiptnum: None,
            company: None,
            remarks: None,
        });
        assert!(matches!(
            result,
            Err(AppError::Validation(message)) if message == "运单号不能为空"
        ));
    }

    #[test]
    fn receipt_batch_status_rejects_duplicate_or_multiple_status_fields() {
        let duplicate = normalize_receipt_batch_status(ReceiptBatchStatusRequest {
            receipt_ids: vec![1, 1],
            recoverystate: None,
            issuestate: Some("已接收".to_owned()),
            poststate: None,
        });
        assert!(matches!(
            duplicate,
            Err(AppError::Validation(message)) if message == "回单 ID 不能重复"
        ));

        let multiple = normalize_receipt_batch_status(ReceiptBatchStatusRequest {
            receipt_ids: vec![1, 2],
            recoverystate: Some("已回收".to_owned()),
            issuestate: Some("已接收".to_owned()),
            poststate: None,
        });
        assert!(matches!(
            multiple,
            Err(AppError::Validation(message)) if message == "每次只能更新一种回单状态"
        ));
    }

    #[test]
    fn receipt_status_preserves_legacy_issue_text() {
        let (_, message) = normalize_receipt_status(ReceiptStatusRequest {
            recoverystate: None,
            issuestate: Some("已发放".to_owned()),
            poststate: None,
        })
        .expect("legacy issue status should be accepted");
        assert_eq!(message, "回单发放成功！");
    }

    #[test]
    fn user_validation_normalizes_names_and_rejects_empty_passwords() {
        let user = normalize_user_create(UserCreateRequest {
            name: "  admin  ".to_owned(),
            password: "secret".to_owned(),
            role_id: 1,
        })
        .expect("valid user should normalize");
        assert_eq!(user.name, "admin");

        let password_request = UserPasswordRequest::Object {
            password: String::new(),
        };
        let password = normalize_user_password(&password_request);
        assert!(matches!(
            password,
            Err(AppError::Validation(message)) if message == "密码不能为空！"
        ));

        let update = normalize_user_update(UserUpdateRequest {
            name: "  ops  ".to_owned(),
            role_id: 2,
        })
        .expect("valid update should normalize");
        assert_eq!(update.name, "ops");
    }

    #[test]
    fn role_validation_deduplicates_menu_ids_and_rejects_empty_fields() {
        let role = normalize_role_mutation(RoleMutationRequest {
            name: "  运营  ".to_owned(),
            intro: "  处理订单  ".to_owned(),
        })
        .expect("valid role should normalize");
        assert_eq!(role.name, "运营");
        assert_eq!(role.intro, "处理订单");

        let (role_id, menu_ids) = normalize_role_assignment(RoleAssignRequest {
            role_id: 2,
            menu_list: vec![10, 10, 11],
        })
        .expect("valid assignment should normalize");
        assert_eq!(role_id, 2);
        assert_eq!(menu_ids, vec![10, 11]);
    }
}

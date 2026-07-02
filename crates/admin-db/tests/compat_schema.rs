use std::fs;

const SCHEMA_PATH: &str = "src/migrations/202607010001_init_compat_schema.sql";

#[test]
fn compat_schema_declares_core_legacy_tables() {
    let schema = fs::read_to_string(SCHEMA_PATH).expect("schema should be readable");

    for table in [
        "role",
        "permission",
        "user",
        "company",
        "memory",
        "avatar",
        "user_role",
        "role_permission",
        "order_list",
        "company_order",
        "receipt",
    ] {
        assert!(
            schema.contains(&format!("CREATE TABLE IF NOT EXISTS `{table}`")),
            "schema should declare `{table}`"
        );
    }
}

#[test]
fn compat_schema_keeps_weak_legacy_relations_without_foreign_keys() {
    let schema = fs::read_to_string(SCHEMA_PATH).expect("schema should be readable");

    assert!(schema.contains("`com_name` VARCHAR(255) NOT NULL"));
    assert!(schema.contains("`oddnumber` VARCHAR(255) NOT NULL"));
    assert!(schema.contains("`billingAt` BIGINT NOT NULL DEFAULT 0"));
    assert!(
        !schema.to_ascii_uppercase().contains("FOREIGN KEY"),
        "first compat schema must not add hard foreign keys before old data is audited"
    );
}

#[test]
fn compat_schema_documents_company_and_chart_repository_contracts() {
    let schema = fs::read_to_string(SCHEMA_PATH).expect("schema should be readable");

    assert!(schema.contains("INDEX `idx_company_order_com_name` (`com_name`)"));
    assert!(schema.contains("INDEX `idx_order_company` (`company`)"));
    assert!(schema.contains("`sumfreight` VARCHAR(255) NOT NULL DEFAULT ''"));
    assert!(schema.contains("`receiptnum` BIGINT NOT NULL DEFAULT 0"));
    assert!(schema.contains("`recoverystate` VARCHAR(255) NOT NULL DEFAULT '未回收'"));
    assert!(schema.contains("`issuestate` VARCHAR(255) NOT NULL DEFAULT '未发放'"));
    assert!(schema.contains("`poststate` VARCHAR(255) NOT NULL DEFAULT '未寄出'"));
}

#[test]
fn compat_schema_supports_user_auth_and_avatar_repositories() {
    let schema = fs::read_to_string(SCHEMA_PATH).expect("schema should be readable");

    assert!(schema.contains("`password` VARCHAR(255) NOT NULL"));
    assert!(schema.contains("`avatar_url` VARCHAR(500) NULL"));
    assert!(schema.contains("`token` TEXT NULL"));
    assert!(schema.contains("`enable` TINYINT NOT NULL DEFAULT 1"));
    assert!(schema.contains("INDEX `idx_user_name` (`name`)"));
    assert!(schema.contains("INDEX `idx_avatar_user_id` (`user_id`)"));
    assert!(schema.contains("INDEX `idx_user_role_user_id` (`user_id`)"));
    assert!(schema.contains("INDEX `idx_user_role_role_id` (`role_id`)"));
}

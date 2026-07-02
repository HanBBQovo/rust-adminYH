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

use std::{env, sync::Arc};

use admin_core::{
    dto::CompanyMutationRequest,
    services::{CompanyService, CompanyStore, CompatCompanyService},
    AppError,
};
use admin_db::{migrations, repositories::MySqlCompanyRepository};
use sqlx::{MySqlPool, Row};
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_company_repository_lists_legacy_countorder_from_company_order_text() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlCompanyRepository::new(pool.clone());

    let total_before = CompanyStore::count(&repository)
        .await
        .expect("company count should load");
    let first_company = scope.seed_company("第一发货公司").await;
    let second_company = scope.seed_company("第二发货公司").await;
    scope.seed_company_order(&first_company.name, "001").await;
    scope.seed_company_order(&first_company.name, "002").await;

    let page = CompanyStore::list(&repository, total_before, 10)
        .await
        .expect("company page should load");
    let first = page
        .iter()
        .find(|company| company.id == first_company.id)
        .expect("first scoped company should appear in appended page");
    let second = page
        .iter()
        .find(|company| company.id == second_company.id)
        .expect("second scoped company should appear in appended page");
    assert_eq!(first.name, first_company.name);
    assert_eq!(first.order_count, 2);
    assert_eq!(second.order_count, 0);

    let detail = CompanyStore::detail(&repository, first_company.id)
        .await
        .expect("company detail should load");
    assert_eq!(detail.len(), 1);
    assert_eq!(detail[0].id, first_company.id);
    assert_eq!(detail[0].order_count, 2);

    let missing_detail = CompanyStore::detail(&repository, first_company.id + 99_999)
        .await
        .expect("missing company detail should keep old empty-array shape");
    assert!(missing_detail.is_empty());

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_company_service_create_update_and_remove_use_real_repository() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlCompanyRepository::new(pool.clone());
    let service = CompatCompanyService::new(Arc::new(repository));

    let created_name = scope.name("新建公司");
    service
        .create(CompanyMutationRequest {
            name: format!("  {created_name}  "),
        })
        .await
        .expect("company should create through SQLx repository");

    let created_id = scope
        .company_id_by_name(&created_name)
        .await
        .expect("created company should exist");
    let created_detail = service
        .detail(created_id)
        .await
        .expect("created company detail should load");
    assert_eq!(created_detail.len(), 1);
    assert_eq!(created_detail[0].name, created_name);
    assert_eq!(created_detail[0].count_order, 0);

    let updated_name = scope.name("改名公司");
    service
        .update(
            created_id,
            CompanyMutationRequest {
                name: updated_name.clone(),
            },
        )
        .await
        .expect("company should update through SQLx repository");
    assert!(scope.company_id_by_name(&created_name).await.is_none());
    assert_eq!(
        scope.company_id_by_name(&updated_name).await,
        Some(created_id)
    );

    service
        .remove(created_id)
        .await
        .expect("company should delete through SQLx repository");
    let removed_detail = service
        .detail(created_id)
        .await
        .expect("removed company detail should keep old empty-array shape");
    assert!(removed_detail.is_empty());

    let missing = service.remove(created_id).await;
    assert!(matches!(missing, Err(AppError::NotFound(_))));

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_company_update_preserves_legacy_weak_company_order_text() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlCompanyRepository::new(pool.clone());

    let company = scope.seed_company("历史公司").await;
    scope.seed_company_order(&company.name, "003").await;
    assert_eq!(
        CompanyStore::detail(&repository, company.id)
            .await
            .expect("company detail should load")[0]
            .order_count,
        1
    );

    let renamed = scope.name("历史公司改名");
    CompanyStore::update(&repository, company.id, &renamed)
        .await
        .expect("company should rename");

    let detail = CompanyStore::detail(&repository, company.id)
        .await
        .expect("renamed company detail should load");
    assert_eq!(detail.len(), 1);
    assert_eq!(detail[0].name, renamed);
    assert_eq!(
        detail[0].order_count, 0,
        "company rename must not silently rewrite old company_order.com_name text"
    );
    assert_eq!(scope.company_order_count_by_name(&company.name).await, 1);

    scope.cleanup().await;
}

async fn test_pool() -> Option<MySqlPool> {
    if env::var("RUN_DB_TESTS").ok().as_deref() != Some("true") {
        eprintln!("SKIP: RUN_DB_TESTS=true 未设置，跳过真实 MySQL 公司仓储测试。");
        return None;
    }
    let url = env::var("ADMIN_DB_TEST_DATABASE_URL")
        .expect("RUN_DB_TESTS=true 需要 ADMIN_DB_TEST_DATABASE_URL");
    let pool = MySqlPool::connect(&url)
        .await
        .expect("ADMIN_DB_TEST_DATABASE_URL should connect");
    migrations::run(&pool)
        .await
        .expect("compat schema migration should run");
    Some(pool)
}

#[derive(Debug, Clone)]
struct TestCompany {
    id: i64,
    name: String,
}

struct TestScope<'a> {
    pool: &'a MySqlPool,
    prefix: String,
}

impl<'a> TestScope<'a> {
    async fn new(pool: &'a MySqlPool) -> Self {
        let prefix = format!("company_{}", Uuid::new_v4().simple());
        let scope = Self { pool, prefix };
        scope.cleanup().await;
        scope
    }

    fn name(&self, suffix: &str) -> String {
        format!("{}-{suffix}", self.prefix)
    }

    fn oddnumber(&self, suffix: &str) -> String {
        format!("{}-{suffix}", self.prefix)
    }

    async fn seed_company(&self, suffix: &str) -> TestCompany {
        let name = self.name(suffix);
        let result = sqlx::query("INSERT INTO `company` (`name`) VALUES (?)")
            .bind(&name)
            .execute(self.pool)
            .await
            .expect("company seed should insert");
        TestCompany {
            id: result.last_insert_id() as i64,
            name,
        }
    }

    async fn seed_company_order(&self, company_name: &str, suffix: &str) -> i64 {
        let oddnumber = self.oddnumber(suffix);
        let order_result = sqlx::query(
            r#"
            INSERT INTO `order_list` (`oddnumber`, `billingAt`, `company`, `sumfreight`, `receiptnum`)
            VALUES (?, 1767225600000, ?, '120', 1)
            "#,
        )
        .bind(&oddnumber)
        .bind(company_name)
        .execute(self.pool)
        .await
        .expect("order seed should insert");
        let order_id = order_result.last_insert_id() as i64;

        sqlx::query("INSERT INTO `company_order` (`com_name`, `order_id`) VALUES (?, ?)")
            .bind(company_name)
            .bind(order_id)
            .execute(self.pool)
            .await
            .expect("company_order seed should insert");
        order_id
    }

    async fn company_id_by_name(&self, name: &str) -> Option<i64> {
        sqlx::query("SELECT `id` FROM `company` WHERE `name` = ?")
            .bind(name)
            .fetch_optional(self.pool)
            .await
            .expect("company lookup should run")
            .and_then(|row| row.try_get("id").ok())
    }

    async fn company_order_count_by_name(&self, name: &str) -> i64 {
        sqlx::query("SELECT COUNT(*) AS total FROM `company_order` WHERE `com_name` = ?")
            .bind(name)
            .fetch_one(self.pool)
            .await
            .expect("company_order count should run")
            .try_get("total")
            .expect("total should exist")
    }

    async fn cleanup(&self) {
        let order_ids: Vec<i64> =
            sqlx::query("SELECT `id` FROM `order_list` WHERE `oddnumber` LIKE ?")
                .bind(format!("{}-%", self.prefix))
                .fetch_all(self.pool)
                .await
                .expect("scoped order ids should load")
                .into_iter()
                .map(|row| row.try_get("id").expect("id should exist"))
                .collect();

        for order_id in order_ids {
            sqlx::query("DELETE FROM `company_order` WHERE `order_id` = ?")
                .bind(order_id)
                .execute(self.pool)
                .await
                .expect("company_order cleanup should run");
        }

        sqlx::query("DELETE FROM `company_order` WHERE `com_name` LIKE ?")
            .bind(format!("{}-%", self.prefix))
            .execute(self.pool)
            .await
            .expect("company_order text cleanup should run");
        sqlx::query("DELETE FROM `order_list` WHERE `oddnumber` LIKE ?")
            .bind(format!("{}-%", self.prefix))
            .execute(self.pool)
            .await
            .expect("order cleanup should run");
        sqlx::query("DELETE FROM `company` WHERE `name` LIKE ?")
            .bind(format!("{}-%", self.prefix))
            .execute(self.pool)
            .await
            .expect("company cleanup should run");
    }
}

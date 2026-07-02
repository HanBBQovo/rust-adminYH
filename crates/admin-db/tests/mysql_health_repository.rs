use std::env;

use admin_db::{
    migrations,
    repositories::{HealthRepository, MySqlHealthRepository},
};
use sqlx::MySqlPool;

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_health_repository_pings_real_database() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let repository = MySqlHealthRepository::new(pool);

    repository
        .ping()
        .await
        .expect("real MySQL health ping should succeed");
}

async fn test_pool() -> Option<MySqlPool> {
    if env::var("RUN_DB_TESTS").ok().as_deref() != Some("true") {
        eprintln!("SKIP: RUN_DB_TESTS=true 未设置，跳过真实 MySQL 健康检查仓储测试。");
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

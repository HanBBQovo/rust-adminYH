use std::env;

use admin_core::{
    auth::legacy_md5_hex,
    dto::{AvatarUploadInput, UserListRequest},
    services::{production_auth_service, AuthService, AuthUserStore, UserService, UserStore},
};
use admin_db::{migrations, repositories::MySqlUserRepository};
use sqlx::{MySqlPool, Row};
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_user_auth_repository_upgrades_legacy_md5_on_login() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlUserRepository::new(pool.clone());
    let service = production_auth_service(std::sync::Arc::new(repository.clone()));

    scope.seed_legacy_user("secret").await;

    let before_login = AuthUserStore::find_by_name(&repository, &scope.username)
        .await
        .expect("legacy user should load")
        .expect("legacy user should exist");
    assert!(before_login.password_hash.is_legacy_md5());

    let login = service
        .login(admin_core::dto::LoginRequest {
            name: scope.username.clone(),
            password: "secret".to_owned(),
            code: None,
        })
        .await
        .expect("legacy md5 user should authenticate");

    assert_eq!(login.name, scope.username);
    assert!(login.token.starts_with(&format!("dev-{}-", scope.user_id)));

    let upgraded_password = scope.user_password().await;
    assert!(upgraded_password.starts_with("$argon2"));
    assert!(!upgraded_password.chars().all(|ch| ch.is_ascii_hexdigit()));
    assert_eq!(
        scope.saved_token().await,
        Some(login.token),
        "login should preserve the old single-token writeback semantics"
    );

    let after_login = AuthUserStore::find_by_name(&repository, &scope.username)
        .await
        .expect("upgraded user should load")
        .expect("upgraded user should exist");
    assert!(after_login.password_hash.is_argon2());

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_user_auth_repository_rejects_bad_password_without_mutating_hash_or_token() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlUserRepository::new(pool.clone());
    let service = production_auth_service(std::sync::Arc::new(repository));

    scope.seed_legacy_user("secret").await;
    let original_password = scope.user_password().await;

    let error = service
        .login(admin_core::dto::LoginRequest {
            name: scope.username.clone(),
            password: "wrong".to_owned(),
            code: None,
        })
        .await
        .expect_err("bad password should fail");

    assert_eq!(error.legacy_code(), -200);
    assert_eq!(scope.user_password().await, original_password);
    assert_eq!(scope.saved_token().await, None);

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_user_store_create_and_update_password_write_argon2_hashes() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlUserRepository::new(pool.clone());
    let service =
        admin_core::services::CompatUserService::new(std::sync::Arc::new(repository.clone()));

    service
        .create(admin_core::dto::UserCreateRequest {
            name: scope.username.clone(),
            password: "created-secret".to_owned(),
            role_id: scope.role_id,
        })
        .await
        .expect("user should create through SQLx repository");

    let created = UserStore::find_by_name(&repository, &scope.username)
        .await
        .expect("created user should load")
        .expect("created user should exist");
    assert_eq!(created.name, scope.username);
    assert!(created.password_hash.starts_with("$argon2"));
    assert!(!created
        .password_hash
        .chars()
        .all(|ch| ch.is_ascii_hexdigit()));

    service
        .update_password(
            created.id,
            admin_core::dto::UserPasswordRequest::Raw("updated-secret".to_owned()),
        )
        .await
        .expect("password should update through SQLx repository");

    let updated = UserStore::find_by_name(&repository, &scope.username)
        .await
        .expect("updated user should load")
        .expect("updated user should exist");
    assert!(updated.password_hash.starts_with("$argon2"));
    assert_ne!(updated.password_hash, created.password_hash);

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_user_store_updates_avatar_metadata_transactionally() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlUserRepository::new(pool.clone());
    let service =
        admin_core::services::CompatUserService::new(std::sync::Arc::new(repository.clone()));

    service
        .create(admin_core::dto::UserCreateRequest {
            name: scope.username.clone(),
            password: "created-secret".to_owned(),
            role_id: scope.role_id,
        })
        .await
        .expect("user should create with default avatar metadata");

    let created = UserStore::find_by_name(&repository, &scope.username)
        .await
        .expect("created user should load")
        .expect("created user should exist");
    let default_avatar = UserStore::avatar(&repository, created.id)
        .await
        .expect("default avatar should load")
        .expect("default avatar should exist");
    assert_eq!(default_avatar.filename, "default.jpg");
    assert_eq!(default_avatar.mimetype, "image/jpeg");
    assert_eq!(default_avatar.user_id, created.id);

    let updated_avatar = service
        .update_avatar(
            created.id,
            AvatarUploadInput {
                filename: "custom-avatar.png".to_owned(),
                mimetype: "image/png".to_owned(),
                size: 12_345,
            },
        )
        .await
        .expect("avatar metadata should update through SQLx repository");

    assert_eq!(updated_avatar.filename, "custom-avatar.png");
    assert_eq!(updated_avatar.mimetype, "image/png");
    assert_eq!(updated_avatar.size, 12_345);
    assert_eq!(updated_avatar.user_id, created.id);

    let row = sqlx::query(
        r#"
        SELECT
            u.`avatar_url`,
            COUNT(a.`id`) AS avatar_count,
            MAX(a.`filename`) AS filename,
            MAX(a.`mimetype`) AS mimetype,
            MAX(a.`size`) AS size
        FROM `user` u
        LEFT JOIN `avatar` a ON a.`user_id` = u.`id`
        WHERE u.`id` = ?
        GROUP BY u.`id`, u.`avatar_url`
        "#,
    )
    .bind(created.id)
    .fetch_one(&pool)
    .await
    .expect("avatar metadata should load from MySQL");

    assert_eq!(
        row.try_get::<String, _>("avatar_url")
            .expect("avatar_url should exist"),
        format!("/users/{}/avatar", created.id)
    );
    assert_eq!(
        row.try_get::<i64, _>("avatar_count")
            .expect("avatar count should exist"),
        1,
        "avatar update must replace metadata in place instead of leaking duplicate rows"
    );
    assert_eq!(
        row.try_get::<String, _>("filename")
            .expect("filename should exist"),
        "custom-avatar.png"
    );
    assert_eq!(
        row.try_get::<String, _>("mimetype")
            .expect("mimetype should exist"),
        "image/png"
    );
    assert_eq!(
        row.try_get::<i64, _>("size").expect("size should exist"),
        12_345
    );

    let missing_user_id = next_id(&pool, "user").await + 9_000;
    let error = service
        .update_avatar(
            missing_user_id,
            AvatarUploadInput {
                filename: "orphan.png".to_owned(),
                mimetype: "image/png".to_owned(),
                size: 99,
            },
        )
        .await
        .expect_err("avatar update must reject missing users before inserting metadata");
    assert_eq!(error.legacy_code(), -404);
    let orphan_count: i64 =
        sqlx::query("SELECT COUNT(*) AS total FROM `avatar` WHERE `user_id` = ?")
            .bind(missing_user_id)
            .fetch_one(&pool)
            .await
            .expect("orphan avatar count should load")
            .try_get("total")
            .expect("orphan avatar count should exist");
    assert_eq!(orphan_count, 0);

    scope.cleanup().await;
}

#[tokio::test]
#[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"]
async fn mysql_user_repository_lists_without_filters() {
    let Some(pool) = test_pool().await else {
        return;
    };
    let scope = TestScope::new(&pool).await;
    let repository = MySqlUserRepository::new(pool.clone());
    let service =
        admin_core::services::CompatUserService::new(std::sync::Arc::new(repository.clone()));

    service
        .create(admin_core::dto::UserCreateRequest {
            name: scope.username.clone(),
            password: "created-secret".to_owned(),
            role_id: scope.role_id,
        })
        .await
        .expect("user should create through SQLx repository");

    let response = service
        .list(UserListRequest {
            offset: 0,
            size: 50,
            name: None,
            enable: None,
            role_id: None,
            create_at: None,
        })
        .await
        .expect("empty user filters must not generate dangling WHERE SQL");

    assert!(
        response.list.iter().any(|user| user.name == scope.username),
        "unfiltered user list should include the seeded user"
    );
    assert!(
        response.total_count >= response.list.len(),
        "unfiltered user count should load alongside the list"
    );

    scope.cleanup().await;
}

async fn test_pool() -> Option<MySqlPool> {
    if env::var("RUN_DB_TESTS").ok().as_deref() != Some("true") {
        eprintln!("SKIP: RUN_DB_TESTS=true 未设置，跳过真实 MySQL 用户认证仓储测试。");
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

struct TestScope<'a> {
    pool: &'a MySqlPool,
    username: String,
    user_id: i64,
    role_id: i64,
}

impl<'a> TestScope<'a> {
    async fn new(pool: &'a MySqlPool) -> Self {
        let prefix = format!("auth_{}", Uuid::new_v4().simple());
        let user_id = next_id(pool, "user").await;
        let role_id = next_id(pool, "role").await;
        let scope = Self {
            pool,
            username: prefix,
            user_id,
            role_id,
        };
        scope.cleanup().await;
        scope.seed_role().await;
        scope
    }

    async fn seed_role(&self) {
        sqlx::query("INSERT INTO `role` (`id`, `name`, `intro`) VALUES (?, ?, ?)")
            .bind(self.role_id)
            .bind(format!("{}-role", self.username))
            .bind("MySQL auth integration role")
            .execute(self.pool)
            .await
            .expect("role seed should insert");
    }

    async fn seed_legacy_user(&self, password: &str) {
        sqlx::query(
            r#"
            INSERT INTO `user` (`id`, `name`, `password`, `avatar_url`, `enable`, `token`)
            VALUES (?, ?, ?, ?, 1, NULL)
            "#,
        )
        .bind(self.user_id)
        .bind(&self.username)
        .bind(legacy_md5_hex(password.as_bytes()))
        .bind(format!("/users/{}/avatar", self.user_id))
        .execute(self.pool)
        .await
        .expect("legacy user seed should insert");

        sqlx::query("INSERT INTO `user_role` (`user_id`, `role_id`) VALUES (?, ?)")
            .bind(self.user_id)
            .bind(self.role_id)
            .execute(self.pool)
            .await
            .expect("user role seed should insert");
    }

    async fn user_password(&self) -> String {
        sqlx::query("SELECT `password` FROM `user` WHERE `name` = ?")
            .bind(&self.username)
            .fetch_one(self.pool)
            .await
            .expect("user password should load")
            .try_get("password")
            .expect("password should exist")
    }

    async fn saved_token(&self) -> Option<String> {
        sqlx::query("SELECT `token` FROM `user` WHERE `name` = ?")
            .bind(&self.username)
            .fetch_optional(self.pool)
            .await
            .expect("user token should load")
            .and_then(|row| row.try_get("token").ok())
    }

    async fn cleanup(&self) {
        sqlx::query("DELETE FROM `avatar` WHERE `user_id` = ? OR `user_id` IN (SELECT `id` FROM `user` WHERE `name` = ?)")
            .bind(self.user_id)
            .bind(&self.username)
            .execute(self.pool)
            .await
            .expect("avatar cleanup should run");
        sqlx::query("DELETE FROM `user_role` WHERE `user_id` = ? OR `role_id` = ? OR `user_id` IN (SELECT `id` FROM `user` WHERE `name` = ?)")
            .bind(self.user_id)
            .bind(self.role_id)
            .bind(&self.username)
            .execute(self.pool)
            .await
            .expect("user role cleanup should run");
        sqlx::query("DELETE FROM `user` WHERE `id` = ? OR `name` = ?")
            .bind(self.user_id)
            .bind(&self.username)
            .execute(self.pool)
            .await
            .expect("user cleanup should run");
        sqlx::query("DELETE FROM `role` WHERE `id` = ?")
            .bind(self.role_id)
            .execute(self.pool)
            .await
            .expect("role cleanup should run");
    }
}

async fn next_id(pool: &MySqlPool, table: &str) -> i64 {
    let sql = format!("SELECT COALESCE(MAX(`id`), 0) + 1000 AS next_id FROM `{table}`");
    sqlx::query(&sql)
        .fetch_one(pool)
        .await
        .expect("next id query should run")
        .try_get("next_id")
        .expect("next id should exist")
}

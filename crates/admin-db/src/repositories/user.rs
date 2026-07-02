use admin_core::{
    auth::PasswordHash,
    domain::AuthUser,
    dto::{
        AvatarInfo, AvatarUploadInput, LegacyUserRecord, UserCreateRequest, UserListRequest,
        UserRoleRecord, UserUpdateRequest,
    },
    services::{
        auth::{AuthUserStore, ServiceFuture as AuthServiceFuture},
        user::{ServiceFuture as UserServiceFuture, UserStore},
    },
    AppError, AppResult,
};
use sqlx::{MySql, MySqlPool, QueryBuilder, Row, Transaction};

#[derive(Debug, Clone)]
pub struct MySqlUserRepository {
    pool: MySqlPool,
}

impl MySqlUserRepository {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }
}

impl AuthUserStore for MySqlUserRepository {
    fn find_by_name<'a>(
        &'a self,
        name: &'a str,
    ) -> AuthServiceFuture<'a, AppResult<Option<AuthUser>>> {
        Box::pin(async move {
            let row = sqlx::query(
                r#"
                SELECT
                    u.`id`,
                    u.`name`,
                    u.`password`,
                    GROUP_CONCAT(ur.`role_id` ORDER BY ur.`role_id`) AS `roleIds`
                FROM `user` u
                LEFT JOIN `user_role` ur ON ur.`user_id` = u.`id`
                WHERE u.`name` = ?
                GROUP BY u.`id`, u.`name`, u.`password`
                "#,
            )
            .bind(name)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)?;

            Ok(row.map(auth_user_from_row))
        })
    }

    fn save_token<'a>(
        &'a self,
        user_id: i64,
        token: &'a str,
    ) -> AuthServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let result = sqlx::query("UPDATE `user` SET `token` = ? WHERE `id` = ?")
                .bind(token)
                .bind(user_id)
                .execute(&self.pool)
                .await
                .map_err(db_error)?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound(format!("user {user_id}")));
            }
            Ok(())
        })
    }

    fn update_password_hash<'a>(
        &'a self,
        user_id: i64,
        password_hash: &'a str,
    ) -> AuthServiceFuture<'a, AppResult<()>> {
        <Self as UserStore>::update_password(self, user_id, password_hash)
    }

    fn find_by_token<'a>(
        &'a self,
        token: &'a str,
    ) -> AuthServiceFuture<'a, AppResult<Option<AuthUser>>> {
        Box::pin(async move {
            let row = sqlx::query(
                r#"
                SELECT
                    u.`id`,
                    u.`name`,
                    u.`password`,
                    GROUP_CONCAT(ur.`role_id` ORDER BY ur.`role_id`) AS `roleIds`
                FROM `user` u
                LEFT JOIN `user_role` ur ON ur.`user_id` = u.`id`
                WHERE u.`token` = ?
                GROUP BY u.`id`, u.`name`, u.`password`
                "#,
            )
            .bind(token)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)?;

            Ok(row.map(auth_user_from_row))
        })
    }
}

impl UserStore for MySqlUserRepository {
    fn list<'a>(
        &'a self,
        input: &'a UserListRequest,
    ) -> UserServiceFuture<'a, AppResult<Vec<LegacyUserRecord>>> {
        Box::pin(async move {
            let mut query = user_select_builder(input);
            query.push(" ORDER BY u.`id` ASC LIMIT ");
            query.push_bind(input.size as i64);
            query.push(" OFFSET ");
            query.push_bind(input.offset as i64);

            query
                .build()
                .map(user_from_row)
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)
        })
    }

    fn count<'a>(&'a self, input: &'a UserListRequest) -> UserServiceFuture<'a, AppResult<usize>> {
        Box::pin(async move {
            let mut query = QueryBuilder::new(
                r#"
                SELECT COUNT(*) AS total
                FROM `user` u
                LEFT JOIN `user_role` ur ON ur.`user_id` = u.`id`
                LEFT JOIN `role` r ON r.`id` = ur.`role_id`
                "#,
            );
            push_user_filters(&mut query, input);
            fetch_count(query, &self.pool).await
        })
    }

    fn find_by_id<'a>(
        &'a self,
        user_id: i64,
    ) -> UserServiceFuture<'a, AppResult<Option<LegacyUserRecord>>> {
        Box::pin(async move {
            sqlx::query(&user_select_sql(" WHERE u.`id` = ?"))
                .bind(user_id)
                .map(user_from_row)
                .fetch_optional(&self.pool)
                .await
                .map_err(db_error)
        })
    }

    fn find_by_name<'a>(
        &'a self,
        name: &'a str,
    ) -> UserServiceFuture<'a, AppResult<Option<LegacyUserRecord>>> {
        Box::pin(async move {
            sqlx::query(&user_select_sql(" WHERE u.`name` = ?"))
                .bind(name)
                .map(user_from_row)
                .fetch_optional(&self.pool)
                .await
                .map_err(db_error)
        })
    }

    fn create<'a>(&'a self, input: UserCreateRequest) -> UserServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(db_error)?;
            let result = sqlx::query(
                r#"
                INSERT INTO `user` (`name`, `password`, `avatar_url`, `enable`)
                VALUES (?, ?, '', 1)
                "#,
            )
            .bind(&input.name)
            .bind(&input.password)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;

            let user_id = result.last_insert_id() as i64;
            let avatar_url = format!("/users/{user_id}/avatar");
            sqlx::query("UPDATE `user` SET `avatar_url` = ? WHERE `id` = ?")
                .bind(&avatar_url)
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            insert_user_role(&mut tx, user_id, input.role_id).await?;
            insert_default_avatar(&mut tx, user_id).await?;
            tx.commit().await.map_err(db_error)
        })
    }

    fn update<'a>(
        &'a self,
        user_id: i64,
        input: UserUpdateRequest,
    ) -> UserServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(db_error)?;
            let result = sqlx::query("UPDATE `user` SET `name` = ? WHERE `id` = ?")
                .bind(&input.name)
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound(format!("user {user_id}")));
            }
            upsert_user_role(&mut tx, user_id, input.role_id).await?;
            tx.commit().await.map_err(db_error)
        })
    }

    fn update_password<'a>(
        &'a self,
        user_id: i64,
        password_hash: &'a str,
    ) -> UserServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let result = sqlx::query("UPDATE `user` SET `password` = ? WHERE `id` = ?")
                .bind(password_hash)
                .bind(user_id)
                .execute(&self.pool)
                .await
                .map_err(db_error)?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound(format!("user {user_id}")));
            }
            Ok(())
        })
    }

    fn remove<'a>(&'a self, user_id: i64) -> UserServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(db_error)?;
            let result = sqlx::query("DELETE FROM `user` WHERE `id` = ?")
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound(format!("user {user_id}")));
            }
            sqlx::query("DELETE FROM `user_role` WHERE `user_id` = ?")
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM `avatar` WHERE `user_id` = ?")
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            tx.commit().await.map_err(db_error)
        })
    }

    fn avatar<'a>(&'a self, user_id: i64) -> UserServiceFuture<'a, AppResult<Option<AvatarInfo>>> {
        Box::pin(async move {
            sqlx::query(
                r#"
                SELECT `filename`, `mimetype`, `size`, `user_id`
                FROM `avatar`
                WHERE `user_id` = ?
                ORDER BY `id` DESC
                LIMIT 1
                "#,
            )
            .bind(user_id)
            .map(avatar_from_row)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)
        })
    }

    fn update_avatar<'a>(
        &'a self,
        user_id: i64,
        input: AvatarUploadInput,
    ) -> UserServiceFuture<'a, AppResult<AvatarInfo>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(db_error)?;
            ensure_user_exists(&mut tx, user_id).await?;
            let avatar_url = format!("/users/{user_id}/avatar");
            sqlx::query("UPDATE `user` SET `avatar_url` = ? WHERE `id` = ?")
                .bind(&avatar_url)
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;

            let existing = sqlx::query("SELECT `id` FROM `avatar` WHERE `user_id` = ? LIMIT 1")
                .bind(user_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?;

            if existing.is_some() {
                sqlx::query(
                    r#"
                    UPDATE `avatar`
                    SET `filename` = ?, `mimetype` = ?, `size` = ?
                    WHERE `user_id` = ?
                    "#,
                )
                .bind(&input.filename)
                .bind(&input.mimetype)
                .bind(input.size as i64)
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            } else {
                sqlx::query(
                    r#"
                    INSERT INTO `avatar` (`filename`, `mimetype`, `size`, `user_id`)
                    VALUES (?, ?, ?, ?)
                    "#,
                )
                .bind(&input.filename)
                .bind(&input.mimetype)
                .bind(input.size as i64)
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            }

            tx.commit().await.map_err(db_error)?;
            Ok(AvatarInfo {
                filename: input.filename,
                mimetype: input.mimetype,
                size: input.size,
                user_id,
            })
        })
    }
}

fn user_select_sql(filter_sql: &str) -> String {
    format!(
        r#"
        SELECT
            u.`id`,
            u.`name`,
            u.`password`,
            COALESCE(u.`avatar_url`, '') AS `avatarUrl`,
            u.`enable`,
            CAST(u.`createAt` AS CHAR) AS `createAt`,
            CAST(u.`updateAt` AS CHAR) AS `updateAt`,
            COALESCE(r.`id`, 0) AS `roleId`,
            COALESCE(r.`name`, '') AS `roleName`,
            COALESCE(r.`intro`, '') AS `roleIntro`,
            COALESCE(CAST(r.`createAt` AS CHAR), '') AS `roleCreateAt`,
            COALESCE(CAST(r.`updateAt` AS CHAR), '') AS `roleUpdateAt`
        FROM `user` u
        LEFT JOIN `user_role` ur ON ur.`user_id` = u.`id`
        LEFT JOIN `role` r ON r.`id` = ur.`role_id`
        {filter_sql}
        "#
    )
}

fn user_select_builder(input: &UserListRequest) -> QueryBuilder<'_, MySql> {
    let mut query = QueryBuilder::new(user_select_sql(""));
    push_user_filters(&mut query, input);
    query
}

fn push_user_filters(query: &mut QueryBuilder<'_, MySql>, input: &UserListRequest) {
    let mut has_filter = false;
    push_like_filter(query, &mut has_filter, "u.`name`", input.name.as_deref());
    if let Some(enable) = input.enable {
        push_filter_separator(query, &mut has_filter);
        query.push("u.`enable` = ");
        query.push_bind(enable);
    }
    if let Some(role_id) = input.role_id {
        push_filter_separator(query, &mut has_filter);
        query.push("ur.`role_id` = ");
        query.push_bind(role_id);
    }
    push_create_at_filter(query, &mut has_filter, input.create_at.as_deref());
}

fn push_filter_separator(query: &mut QueryBuilder<'_, MySql>, has_filter: &mut bool) {
    if *has_filter {
        query.push(" AND ");
    } else {
        query.push(" WHERE ");
        *has_filter = true;
    }
}

fn push_like_filter(
    query: &mut QueryBuilder<'_, MySql>,
    has_filter: &mut bool,
    column: &'static str,
    value: Option<&str>,
) {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    push_filter_separator(query, has_filter);
    query.push(column);
    query.push(" LIKE ");
    query.push_bind(format!("%{value}%"));
}

fn push_create_at_filter(
    query: &mut QueryBuilder<'_, MySql>,
    has_filter: &mut bool,
    create_at: Option<&[String]>,
) {
    let Some(range) = create_at else {
        return;
    };
    match range {
        [date] if !date.trim().is_empty() => {
            push_filter_separator(query, has_filter);
            query.push("DATE(u.`createAt`) = ");
            query.push_bind(date.trim().to_owned());
        }
        [start, end] if !start.trim().is_empty() && !end.trim().is_empty() => {
            push_filter_separator(query, has_filter);
            query.push("DATE(u.`createAt`) BETWEEN ");
            query.push_bind(start.trim().to_owned());
            query.push(" AND ");
            query.push_bind(end.trim().to_owned());
        }
        _ => {}
    }
}

async fn fetch_count(mut query: QueryBuilder<'_, MySql>, pool: &MySqlPool) -> AppResult<usize> {
    query
        .build()
        .fetch_one(pool)
        .await
        .map_err(db_error)?
        .try_get::<i64, _>("total")
        .map(|value| value as usize)
        .map_err(db_error)
}

async fn ensure_user_exists(tx: &mut Transaction<'_, MySql>, user_id: i64) -> AppResult<()> {
    let exists = sqlx::query("SELECT `id` FROM `user` WHERE `id` = ?")
        .bind(user_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .is_some();
    if !exists {
        return Err(AppError::NotFound(format!("user {user_id}")));
    }
    Ok(())
}

async fn insert_user_role(
    tx: &mut Transaction<'_, MySql>,
    user_id: i64,
    role_id: i64,
) -> AppResult<()> {
    sqlx::query("INSERT INTO `user_role` (`user_id`, `role_id`) VALUES (?, ?)")
        .bind(user_id)
        .bind(role_id)
        .execute(&mut **tx)
        .await
        .map(|_| ())
        .map_err(db_error)
}

async fn upsert_user_role(
    tx: &mut Transaction<'_, MySql>,
    user_id: i64,
    role_id: i64,
) -> AppResult<()> {
    let result = sqlx::query("UPDATE `user_role` SET `role_id` = ? WHERE `user_id` = ?")
        .bind(role_id)
        .bind(user_id)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    if result.rows_affected() == 0 {
        insert_user_role(tx, user_id, role_id).await?;
    }
    Ok(())
}

async fn insert_default_avatar(tx: &mut Transaction<'_, MySql>, user_id: i64) -> AppResult<()> {
    let default = AvatarInfo::default_for_user(user_id);
    sqlx::query(
        r#"
        INSERT INTO `avatar` (`filename`, `mimetype`, `size`, `user_id`)
        VALUES (?, ?, ?, ?)
        "#,
    )
    .bind(default.filename)
    .bind(default.mimetype)
    .bind(default.size as i64)
    .bind(user_id)
    .execute(&mut **tx)
    .await
    .map(|_| ())
    .map_err(db_error)
}

fn auth_user_from_row(row: sqlx::mysql::MySqlRow) -> AuthUser {
    AuthUser::new(
        get_i64(&row, "id"),
        get_string(&row, "name"),
        PasswordHash::new(get_string(&row, "password")),
    )
    .with_role_ids(parse_role_ids(
        &get_nullable_string(&row, "roleIds").unwrap_or_default(),
    ))
}

fn user_from_row(row: sqlx::mysql::MySqlRow) -> LegacyUserRecord {
    LegacyUserRecord {
        id: get_i64(&row, "id"),
        name: get_string(&row, "name"),
        password_hash: get_string(&row, "password"),
        avatar_url: get_string(&row, "avatarUrl"),
        enable: get_i32(&row, "enable"),
        role: UserRoleRecord {
            id: get_i64(&row, "roleId"),
            name: get_string(&row, "roleName"),
            intro: get_string(&row, "roleIntro"),
            create_at: get_string(&row, "roleCreateAt"),
            update_at: get_string(&row, "roleUpdateAt"),
        },
        create_at: get_string(&row, "createAt"),
        update_at: get_string(&row, "updateAt"),
    }
}

fn avatar_from_row(row: sqlx::mysql::MySqlRow) -> AvatarInfo {
    AvatarInfo {
        filename: get_string(&row, "filename"),
        mimetype: get_string(&row, "mimetype"),
        size: get_i64(&row, "size").max(0) as usize,
        user_id: get_i64(&row, "user_id"),
    }
}

fn parse_role_ids(value: &str) -> Vec<i64> {
    value
        .split(',')
        .filter_map(|part| part.trim().parse::<i64>().ok())
        .collect()
}

fn get_nullable_string(row: &sqlx::mysql::MySqlRow, column: &str) -> Option<String> {
    row.try_get::<Option<String>, _>(column).ok().flatten()
}

fn get_string(row: &sqlx::mysql::MySqlRow, column: &str) -> String {
    get_nullable_string(row, column)
        .or_else(|| row.try_get::<String, _>(column).ok())
        .unwrap_or_default()
}

fn get_i32(row: &sqlx::mysql::MySqlRow, column: &str) -> i32 {
    row.try_get::<i32, _>(column)
        .ok()
        .or_else(|| {
            row.try_get::<i64, _>(column)
                .ok()
                .and_then(|value| value.try_into().ok())
        })
        .unwrap_or_default()
}

fn get_i64(row: &sqlx::mysql::MySqlRow, column: &str) -> i64 {
    row.try_get::<i64, _>(column)
        .ok()
        .or_else(|| {
            row.try_get::<u64, _>(column)
                .ok()
                .and_then(|value| value.try_into().ok())
        })
        .unwrap_or_default()
}

fn db_error(error: sqlx::Error) -> AppError {
    AppError::Database(error.to_string())
}

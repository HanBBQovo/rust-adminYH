use std::{
    collections::{BTreeMap, BTreeSet},
    fmt::{self, Display},
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{mysql::MySqlRow, MySqlPool, Row};
use tokio::task;
use walkdir::WalkDir;

const EXPECTED_TABLES: &[&str] = &[
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
];

const COPY_BATCH_SIZE: usize = 250;

const TABLE_SPECS: &[TableSpec] = &[
    TableSpec {
        table: "role",
        columns: &["id", "name", "intro", "createAt", "updateAt"],
    },
    TableSpec {
        table: "permission",
        columns: &[
            "id", "pid", "name", "type", "url", "icon", "sort", "createAt", "updateAt",
        ],
    },
    TableSpec {
        table: "user",
        columns: &[
            "id",
            "name",
            "password",
            "avatar_url",
            "token",
            "enable",
            "createAt",
            "updateAt",
        ],
    },
    TableSpec {
        table: "company",
        columns: &["id", "name", "createAt", "updateAt"],
    },
    TableSpec {
        table: "memory",
        columns: &["id", "name", "createAt", "updateAt"],
    },
    TableSpec {
        table: "avatar",
        columns: &[
            "id", "filename", "mimetype", "size", "user_id", "createAt", "updateAt",
        ],
    },
    TableSpec {
        table: "user_role",
        columns: &["id", "user_id", "role_id", "createAt", "updateAt"],
    },
    TableSpec {
        table: "role_permission",
        columns: &["id", "role_id", "permission_id", "createAt", "updateAt"],
    },
    TableSpec {
        table: "order_list",
        columns: &[
            "id",
            "oddnumber",
            "billingAt",
            "consignee",
            "consigneephone",
            "address",
            "method",
            "goodsname",
            "number",
            "pack",
            "weight",
            "measurement",
            "cainsurance",
            "value",
            "insurance",
            "consignor",
            "consignorphone",
            "freight",
            "delivery",
            "sumfreight",
            "freightstate",
            "paynow",
            "paygo",
            "payback",
            "paymonth",
            "receiptnum",
            "company",
            "remarks",
            "createAt",
            "updateAt",
        ],
    },
    TableSpec {
        table: "company_order",
        columns: &["id", "com_name", "order_id", "createAt", "updateAt"],
    },
    TableSpec {
        table: "receipt",
        columns: &[
            "id",
            "oddnumber",
            "billingAt",
            "recoverystate",
            "issuestate",
            "poststate",
            "recoverynumber",
            "consignor",
            "consignee",
            "goodsname",
            "goodsnumber",
            "createAt",
            "updateAt",
        ],
    },
];

const DUPLICATE_CHECKS: &[DuplicateCheck] = &[
    DuplicateCheck {
        table: "user",
        column: "name",
        label: "user.name",
    },
    DuplicateCheck {
        table: "company",
        column: "name",
        label: "company.name",
    },
    DuplicateCheck {
        table: "order_list",
        column: "oddnumber",
        label: "order_list.oddnumber",
    },
    DuplicateCheck {
        table: "memory",
        column: "name",
        label: "memory.name",
    },
    DuplicateCheck {
        table: "role_permission",
        column: "role_id,permission_id",
        label: "role_permission.role_id_permission_id",
    },
];

const ORPHAN_CHECKS: &[OrphanCheck] = &[
    OrphanCheck {
        label: "user_role.user_id",
        sql: "SELECT COUNT(*) AS total FROM `user_role` ur LEFT JOIN `user` u ON u.id = ur.user_id WHERE u.id IS NULL",
    },
    OrphanCheck {
        label: "user_role.role_id",
        sql: "SELECT COUNT(*) AS total FROM `user_role` ur LEFT JOIN `role` r ON r.id = ur.role_id WHERE r.id IS NULL",
    },
    OrphanCheck {
        label: "role_permission.role_id",
        sql: "SELECT COUNT(*) AS total FROM `role_permission` rp LEFT JOIN `role` r ON r.id = rp.role_id WHERE r.id IS NULL",
    },
    OrphanCheck {
        label: "role_permission.permission_id",
        sql: "SELECT COUNT(*) AS total FROM `role_permission` rp LEFT JOIN `permission` p ON p.id = rp.permission_id WHERE p.id IS NULL",
    },
    OrphanCheck {
        label: "company_order.order_id",
        sql: "SELECT COUNT(*) AS total FROM `company_order` co LEFT JOIN `order_list` o ON o.id = co.order_id WHERE o.id IS NULL",
    },
    OrphanCheck {
        label: "company_order.com_name",
        sql: "SELECT COUNT(*) AS total FROM `company_order` co LEFT JOIN `company` c ON c.name = co.com_name WHERE c.id IS NULL",
    },
    OrphanCheck {
        label: "receipt.oddnumber",
        sql: "SELECT COUNT(*) AS total FROM `receipt` r LEFT JOIN `order_list` o ON o.oddnumber = r.oddnumber WHERE o.id IS NULL",
    },
    OrphanCheck {
        label: "avatar.user_id",
        sql: "SELECT COUNT(*) AS total FROM `avatar` a LEFT JOIN `user` u ON u.id = a.user_id WHERE u.id IS NULL",
    },
];

const STATUS_CHECKS: &[StatusCheck] = &[
    StatusCheck {
        table: "receipt",
        column: "recoverystate",
        label: "receipt.recoverystate",
    },
    StatusCheck {
        table: "receipt",
        column: "issuestate",
        label: "receipt.issuestate",
    },
    StatusCheck {
        table: "receipt",
        column: "poststate",
        label: "receipt.poststate",
    },
];

const DATE_BOUND_CHECKS: &[DateBoundCheck] = &[
    DateBoundCheck {
        table: "order_list",
        column: "billingAt",
        label: "order_list.billingAt",
    },
    DateBoundCheck {
        table: "order_list",
        column: "createAt",
        label: "order_list.createAt",
    },
    DateBoundCheck {
        table: "order_list",
        column: "updateAt",
        label: "order_list.updateAt",
    },
    DateBoundCheck {
        table: "receipt",
        column: "billingAt",
        label: "receipt.billingAt",
    },
    DateBoundCheck {
        table: "receipt",
        column: "createAt",
        label: "receipt.createAt",
    },
    DateBoundCheck {
        table: "receipt",
        column: "updateAt",
        label: "receipt.updateAt",
    },
];

#[derive(Debug, Parser)]
#[command(name = "admin-migration")]
#[command(about = "AdminYH legacy database migration audit and verification CLI")]
pub struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    InspectOld {
        #[arg(long)]
        old: String,
        #[arg(long)]
        old_avatar_dir: Option<PathBuf>,
        #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
        format: OutputFormat,
    },
    Migrate {
        #[arg(long)]
        dry_run: bool,
        #[arg(long)]
        allow_non_empty_target: bool,
        #[arg(long)]
        old: String,
        #[arg(long)]
        new: String,
        #[arg(long)]
        old_avatar_dir: Option<PathBuf>,
        #[arg(long)]
        new_avatar_dir: Option<PathBuf>,
        #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
        format: OutputFormat,
    },
    Verify {
        #[arg(long)]
        old: String,
        #[arg(long)]
        new: String,
        #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
        format: OutputFormat,
    },
    VerifyFiles {
        #[arg(long)]
        old_avatar_dir: PathBuf,
        #[arg(long)]
        new_avatar_dir: PathBuf,
        #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
        format: OutputFormat,
    },
    RollbackPlan {
        #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
        format: OutputFormat,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum OutputFormat {
    Json,
    Text,
}

impl Display for OutputFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            OutputFormat::Json => f.write_str("json"),
            OutputFormat::Text => f.write_str("text"),
        }
    }
}

pub async fn run_cli(cli: Cli) -> Result<()> {
    match cli.command {
        Commands::InspectOld {
            old,
            old_avatar_dir,
            format,
        } => {
            let report = inspect_old(&old, old_avatar_dir.as_deref()).await?;
            print_report(&report, format)
        }
        Commands::Migrate {
            dry_run,
            allow_non_empty_target,
            old,
            new,
            old_avatar_dir,
            new_avatar_dir,
            format,
        } => {
            let report = migrate_database(
                &old,
                &new,
                old_avatar_dir.as_deref(),
                new_avatar_dir.as_deref(),
                dry_run,
                allow_non_empty_target,
            )
            .await?;
            print_report(&report, format)
        }
        Commands::Verify { old, new, format } => {
            let report = verify_databases(&old, &new).await?;
            let passed = report.status == "passed";
            print_report(&report, format)?;
            if passed {
                Ok(())
            } else {
                Err(anyhow!(
                    "migration verification failed: {}",
                    report.warnings.join("; ")
                ))
            }
        }
        Commands::VerifyFiles {
            old_avatar_dir,
            new_avatar_dir,
            format,
        } => {
            let report = verify_files(&old_avatar_dir, &new_avatar_dir).await?;
            let passed = report.status == "passed";
            let failure_summary = format!(
                "missing_in_new={} extra_in_new={} changed={}",
                report.missing_in_new.len(),
                report.extra_in_new.len(),
                report.changed.len()
            );
            print_report(&report, format)?;
            if passed {
                Ok(())
            } else {
                Err(anyhow!(
                    "avatar file verification failed: {failure_summary}"
                ))
            }
        }
        Commands::RollbackPlan { format } => {
            let report = RollbackPlanReport {
                command: "rollback-plan".to_owned(),
                generated_at: generated_at(),
                freeze_controls: rollback_freeze_controls(),
                required_artifacts: rollback_required_artifacts(),
                restore_steps: rollback_restore_steps(),
                verification_steps: rollback_verification_steps(),
                cutover_criteria: rollback_cutover_criteria(),
                failure_record: rollback_failure_record(),
            };
            print_report(&report, format)
        }
    }
}

pub async fn inspect_old(old_url: &str, old_avatar_dir: Option<&Path>) -> Result<MigrationReport> {
    let pool = MySqlPool::connect(old_url)
        .await
        .with_context(|| "failed to connect to legacy database")?;

    let mut warnings = Vec::new();
    let tables = inspect_tables(&pool).await?;
    let duplicates = inspect_duplicates(&pool).await?;
    let orphans = inspect_orphans(&pool).await?;
    let status_distributions = inspect_status_distributions(&pool).await?;
    let date_bounds = inspect_date_bounds(&pool).await?;
    let avatar_files = if let Some(dir) = old_avatar_dir {
        Some(inspect_avatar_files(dir).await?)
    } else {
        warnings.push("old avatar directory not provided; skipped disk file audit".to_owned());
        None
    };

    let avatar_diff = if let Some(files) = &avatar_files {
        Some(inspect_avatar_diff(&pool, files).await?)
    } else {
        None
    };

    Ok(MigrationReport {
        command: "inspect-old".to_owned(),
        generated_at: generated_at(),
        old_database: DatabaseRef {
            url_masked: mask_database_url(old_url),
        },
        new_database: None,
        tables,
        duplicates,
        orphans,
        status_distributions,
        date_bounds,
        avatar_files,
        avatar_diff,
        target_preflight: None,
        copy_summaries: Vec::new(),
        avatar_file_copy: None,
        warnings,
    })
}

pub async fn migrate_database(
    old_url: &str,
    new_url: &str,
    old_avatar_dir: Option<&Path>,
    new_avatar_dir: Option<&Path>,
    dry_run: bool,
    allow_non_empty_target: bool,
) -> Result<MigrationReport> {
    let mut report = inspect_old(old_url, old_avatar_dir).await?;
    report.command = if dry_run {
        "migrate --dry-run".to_owned()
    } else {
        "migrate".to_owned()
    };
    report.new_database = Some(DatabaseRef {
        url_masked: mask_database_url(new_url),
    });

    if dry_run {
        let new_pool = MySqlPool::connect(new_url)
            .await
            .with_context(|| "failed to connect to target database for dry-run preflight")?;
        let target_preflight = inspect_target_preflight(&new_pool).await?;
        if !target_preflight.is_empty {
            report.warnings.push(format!(
                "dry-run target preflight: target database is not empty: {}",
                target_preflight
                    .populated_tables
                    .iter()
                    .map(|table| format!("{}={}", table.name, table.row_count))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        } else {
            report
                .warnings
                .push("dry-run target preflight: target schema is reachable and empty".to_owned());
        }
        report.target_preflight = Some(target_preflight);
        report
            .warnings
            .push("dry-run only: no rows or files were written".to_owned());
        if new_avatar_dir.is_some() {
            report
                .warnings
                .push("dry-run only: avatar files were not copied".to_owned());
        }
        return Ok(report);
    }

    let old_pool = MySqlPool::connect(old_url)
        .await
        .with_context(|| "failed to connect to legacy database for migration")?;
    let new_pool = MySqlPool::connect(new_url)
        .await
        .with_context(|| "failed to connect to target database for migration")?;

    if !allow_non_empty_target {
        ensure_target_empty(&new_pool).await?;
    }

    for spec in TABLE_SPECS {
        let summary = copy_table(&old_pool, &new_pool, spec).await?;
        report.copy_summaries.push(summary);
    }

    if let (Some(old_dir), Some(new_dir)) = (old_avatar_dir, new_avatar_dir) {
        report.avatar_file_copy = Some(copy_avatar_files(old_dir, new_dir).await?);
    } else if old_avatar_dir.is_some() {
        report.warnings.push(
            "old avatar directory provided but new avatar directory missing; skipped file copy"
                .to_owned(),
        );
    }

    let verify_report = verify_databases_with_pools(&old_pool, &new_pool, old_url, new_url).await?;
    if verify_report.status != "passed" {
        return Err(anyhow!(
            "migration verification failed after apply: {}",
            verify_report.warnings.join("; ")
        ));
    }

    report.warnings.push(
        "apply completed: target database row counts, ids, aggregates, statuses and weak relations verified"
            .to_owned(),
    );
    Ok(report)
}

pub async fn verify_databases(old_url: &str, new_url: &str) -> Result<VerifyReport> {
    let old_pool = MySqlPool::connect(old_url)
        .await
        .with_context(|| "failed to connect to legacy database for verification")?;
    let new_pool = MySqlPool::connect(new_url)
        .await
        .with_context(|| "failed to connect to target database for verification")?;

    verify_databases_with_pools(&old_pool, &new_pool, old_url, new_url).await
}

async fn verify_databases_with_pools(
    old_pool: &MySqlPool,
    new_pool: &MySqlPool,
    old_url: &str,
    new_url: &str,
) -> Result<VerifyReport> {
    let mut checks = Vec::new();
    let mut warnings = Vec::new();

    compare_table_summaries(old_pool, new_pool, &mut checks, &mut warnings).await?;
    compare_table_fingerprints(old_pool, new_pool, &mut checks, &mut warnings).await?;
    compare_status_distributions(old_pool, new_pool, &mut checks, &mut warnings).await?;
    compare_orphan_counts(old_pool, new_pool, &mut checks, &mut warnings).await?;
    compare_date_bounds(old_pool, new_pool, &mut checks, &mut warnings).await?;

    compare_scalar_metrics(
        "order_list.metrics",
        "SELECT CAST(COUNT(*) AS CHAR) AS row_count, CAST(COUNT(DISTINCT `oddnumber`) AS CHAR) AS distinct_oddnumber, CAST(COALESCE(SUM(CAST(NULLIF(`sumfreight`, '') AS DECIMAL(20,2))), 0) AS CHAR) AS sumfreight, CAST(COALESCE(SUM(`receiptnum`), 0) AS CHAR) AS receiptnum, CAST(MIN(`billingAt`) AS CHAR) AS min_billingAt, CAST(MAX(`billingAt`) AS CHAR) AS max_billingAt FROM `order_list`",
        &[
            "row_count",
            "distinct_oddnumber",
            "sumfreight",
            "receiptnum",
            "min_billingAt",
            "max_billingAt",
        ],
        old_pool,
        new_pool,
        &mut checks,
        &mut warnings,
    )
    .await?;
    compare_scalar_metrics(
        "avatar.db_metrics",
        "SELECT CAST(COUNT(*) AS CHAR) AS row_count, CAST(COUNT(DISTINCT `filename`) AS CHAR) AS distinct_filename, CAST(COUNT(DISTINCT `user_id`) AS CHAR) AS distinct_user_id FROM `avatar`",
        &["row_count", "distinct_filename", "distinct_user_id"],
        old_pool,
        new_pool,
        &mut checks,
        &mut warnings,
    )
    .await?;
    compare_scalar_metrics(
        "user.avatar_url_metrics",
        "SELECT CAST(COUNT(*) AS CHAR) AS row_count, CAST(SUM(CASE WHEN `avatar_url` IS NOT NULL AND `avatar_url` <> '' THEN 1 ELSE 0 END) AS CHAR) AS users_with_avatar_url FROM `user`",
        &["row_count", "users_with_avatar_url"],
        old_pool,
        new_pool,
        &mut checks,
        &mut warnings,
    )
    .await?;

    compare_group_counts(
        "receipt.status_combo",
        "SELECT CONCAT_WS('|', `recoverystate`, `issuestate`, `poststate`) AS value, COUNT(*) AS total FROM `receipt` GROUP BY `recoverystate`, `issuestate`, `poststate`",
        old_pool,
        new_pool,
        &mut checks,
        &mut warnings,
    )
    .await?;
    compare_group_counts(
        "user_role.by_role",
        "SELECT CAST(`role_id` AS CHAR) AS value, COUNT(*) AS total FROM `user_role` GROUP BY `role_id`",
        old_pool,
        new_pool,
        &mut checks,
        &mut warnings,
    )
    .await?;
    compare_group_counts(
        "role_permission.by_role",
        "SELECT CAST(`role_id` AS CHAR) AS value, COUNT(*) AS total FROM `role_permission` GROUP BY `role_id`",
        old_pool,
        new_pool,
        &mut checks,
        &mut warnings,
    )
    .await?;
    compare_group_counts(
        "permission.pid_type",
        "SELECT CONCAT_WS('|', `pid`, `type`) AS value, COUNT(*) AS total FROM `permission` GROUP BY `pid`, `type`",
        old_pool,
        new_pool,
        &mut checks,
        &mut warnings,
    )
    .await?;

    Ok(VerifyReport {
        command: "verify".to_owned(),
        generated_at: generated_at(),
        old_database: DatabaseRef {
            url_masked: mask_database_url(old_url),
        },
        new_database: DatabaseRef {
            url_masked: mask_database_url(new_url),
        },
        status: if warnings.is_empty() {
            "passed".to_owned()
        } else {
            "failed".to_owned()
        },
        checks,
        warnings,
    })
}

pub async fn verify_files(
    old_avatar_dir: &Path,
    new_avatar_dir: &Path,
) -> Result<FileVerifyReport> {
    let old_files = inspect_avatar_files(old_avatar_dir).await?;
    let new_files = inspect_avatar_files(new_avatar_dir).await?;

    let old_hashes = file_hash_map(&old_files);
    let new_hashes = file_hash_map(&new_files);

    let missing_in_new: Vec<String> = old_hashes
        .keys()
        .filter(|path| !new_hashes.contains_key(*path))
        .cloned()
        .collect();
    let extra_in_new: Vec<String> = new_hashes
        .keys()
        .filter(|path| !old_hashes.contains_key(*path))
        .cloned()
        .collect();
    let changed: Vec<String> = old_hashes
        .iter()
        .filter_map(|(path, old_hash)| {
            new_hashes
                .get(path)
                .filter(|new_hash| *new_hash != old_hash)
                .map(|_| path.clone())
        })
        .collect();
    let status = if missing_in_new.is_empty() && extra_in_new.is_empty() && changed.is_empty() {
        "passed"
    } else {
        "failed"
    }
    .to_owned();

    Ok(FileVerifyReport {
        command: "verify-files".to_owned(),
        generated_at: generated_at(),
        status,
        old_avatar_files: old_files,
        new_avatar_files: new_files,
        missing_in_new,
        extra_in_new,
        changed,
    })
}

async fn ensure_target_empty(pool: &MySqlPool) -> Result<()> {
    let preflight = inspect_target_preflight(pool).await?;

    if preflight.is_empty {
        Ok(())
    } else {
        Err(anyhow!(
            "target database is not empty; refusing apply without --allow-non-empty-target: {}",
            preflight
                .populated_tables
                .iter()
                .map(|table| format!("{}={}", table.name, table.row_count))
                .collect::<Vec<_>>()
                .join(", ")
        ))
    }
}

async fn inspect_target_preflight(pool: &MySqlPool) -> Result<TargetPreflight> {
    let tables = inspect_tables(pool).await?;
    Ok(build_target_preflight(tables))
}

fn build_target_preflight(tables: Vec<TableSummary>) -> TargetPreflight {
    let populated_tables = tables
        .iter()
        .filter(|table| table.row_count > 0)
        .cloned()
        .collect::<Vec<_>>();

    TargetPreflight {
        is_empty: populated_tables.is_empty(),
        populated_tables,
        tables,
    }
}

async fn copy_table(
    old_pool: &MySqlPool,
    new_pool: &MySqlPool,
    spec: &TableSpec,
) -> Result<TableCopySummary> {
    let columns = quoted_columns(spec.columns);
    let select_columns = cast_columns(spec.columns);
    let placeholders = std::iter::repeat("?")
        .take(spec.columns.len())
        .collect::<Vec<_>>()
        .join(", ");
    let select_sql = format!(
        "SELECT {select_columns} FROM `{}` ORDER BY `id` ASC",
        spec.table
    );
    let insert_sql = format!(
        "INSERT INTO `{}` ({columns}) VALUES ({placeholders})",
        spec.table
    );

    let rows = sqlx::query(&select_sql)
        .fetch_all(old_pool)
        .await
        .with_context(|| format!("failed to read source table {}", spec.table))?;
    let mut copied = 0_i64;

    for chunk in rows.chunks(COPY_BATCH_SIZE) {
        let mut tx = new_pool
            .begin()
            .await
            .with_context(|| format!("failed to begin target transaction for {}", spec.table))?;
        for row in chunk {
            let mut query = sqlx::query(&insert_sql);
            for column in spec.columns {
                let value = string_cell_ref(row, column);
                query = query.bind(value);
            }
            query
                .execute(&mut *tx)
                .await
                .with_context(|| format!("failed to insert row into {}", spec.table))?;
            copied += 1;
        }
        tx.commit()
            .await
            .with_context(|| format!("failed to commit copied rows for {}", spec.table))?;
    }

    let old_summary = inspect_table(old_pool, spec.table).await?;
    let new_summary = inspect_table(new_pool, spec.table).await?;
    if old_summary != new_summary {
        return Err(anyhow!(
            "post-copy table summary mismatch for {}: old={old_summary:?} new={new_summary:?}",
            spec.table
        ));
    }
    set_auto_increment(new_pool, spec.table, old_summary.max_id).await?;

    Ok(TableCopySummary {
        table: spec.table.to_owned(),
        copied_rows: copied,
        row_count: new_summary.row_count,
        min_id: new_summary.min_id,
        max_id: new_summary.max_id,
    })
}

async fn set_auto_increment(pool: &MySqlPool, table: &str, max_id: Option<i64>) -> Result<()> {
    let Some(max_id) = max_id else {
        return Ok(());
    };
    let next_id = max_id.saturating_add(1).max(1);
    let sql = format!("ALTER TABLE `{table}` AUTO_INCREMENT = {next_id}");
    sqlx::query(&sql)
        .execute(pool)
        .await
        .with_context(|| format!("failed to set AUTO_INCREMENT for {table}"))?;
    Ok(())
}

async fn copy_avatar_files(old_dir: &Path, new_dir: &Path) -> Result<FileCopySummary> {
    let old_dir = old_dir.to_path_buf();
    let new_dir = new_dir.to_path_buf();
    task::spawn_blocking(move || copy_avatar_files_blocking(&old_dir, &new_dir))
        .await
        .with_context(|| "failed to join avatar copy task")?
}

fn copy_avatar_files_blocking(old_dir: &Path, new_dir: &Path) -> Result<FileCopySummary> {
    if !old_dir.exists() {
        return Err(anyhow!(
            "old avatar directory does not exist: {}",
            old_dir.display()
        ));
    }

    fs::create_dir_all(new_dir)
        .with_context(|| format!("failed to create {}", new_dir.display()))?;

    let mut copied_files = 0_u64;
    let mut copied_bytes = 0_u64;
    for entry in WalkDir::new(old_dir).sort_by_file_name() {
        let entry = entry.with_context(|| format!("failed to read {}", old_dir.display()))?;
        if !entry.file_type().is_file() {
            continue;
        }

        let source = entry.path();
        let relative_path = source.strip_prefix(old_dir).unwrap_or(source);
        let target = new_dir.join(relative_path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
        }
        let bytes = fs::copy(source, &target).with_context(|| {
            format!(
                "failed to copy {} to {}",
                source.display(),
                target.display()
            )
        })?;
        copied_files += 1;
        copied_bytes += bytes;
    }

    Ok(FileCopySummary {
        old_directory: old_dir.display().to_string(),
        new_directory: new_dir.display().to_string(),
        copied_files,
        copied_bytes,
    })
}

async fn compare_table_summaries(
    old_pool: &MySqlPool,
    new_pool: &MySqlPool,
    checks: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    for table in EXPECTED_TABLES {
        let old = inspect_table(old_pool, table).await?;
        let new = inspect_table(new_pool, table).await?;
        push_comparison(
            checks,
            warnings,
            format!("table.{table}.summary"),
            old == new,
            format!("old={old:?} new={new:?}"),
        );
    }
    Ok(())
}

async fn compare_table_fingerprints(
    old_pool: &MySqlPool,
    new_pool: &MySqlPool,
    checks: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    for spec in TABLE_SPECS {
        let old = table_fingerprint(old_pool, spec).await?;
        let new = table_fingerprint(new_pool, spec).await?;
        push_comparison(
            checks,
            warnings,
            format!("table.{}.fingerprint", spec.table),
            old == new,
            format!("old={old} new={new}"),
        );
    }
    Ok(())
}

async fn compare_status_distributions(
    old_pool: &MySqlPool,
    new_pool: &MySqlPool,
    checks: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    let old = inspect_status_distributions(old_pool).await?;
    let new = inspect_status_distributions(new_pool).await?;
    for (old_status, new_status) in old.iter().zip(new.iter()) {
        push_comparison(
            checks,
            warnings,
            format!("status.{}", old_status.field),
            old_status.values == new_status.values,
            format!("old={:?} new={:?}", old_status.values, new_status.values),
        );
    }
    Ok(())
}

async fn compare_orphan_counts(
    old_pool: &MySqlPool,
    new_pool: &MySqlPool,
    checks: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    let old = inspect_orphans(old_pool).await?;
    let new = inspect_orphans(new_pool).await?;
    for (old_orphan, new_orphan) in old.iter().zip(new.iter()) {
        push_comparison(
            checks,
            warnings,
            format!("orphan.{}", old_orphan.name),
            old_orphan.count == new_orphan.count,
            format!("old={} new={}", old_orphan.count, new_orphan.count),
        );
    }
    Ok(())
}

async fn compare_date_bounds(
    old_pool: &MySqlPool,
    new_pool: &MySqlPool,
    checks: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    let old = inspect_date_bounds(old_pool).await?;
    let new = inspect_date_bounds(new_pool).await?;
    for (old_bounds, new_bounds) in old.iter().zip(new.iter()) {
        push_comparison(
            checks,
            warnings,
            format!("date_bounds.{}", old_bounds.field),
            old_bounds.min == new_bounds.min && old_bounds.max == new_bounds.max,
            format!(
                "old=({:?},{:?}) new=({:?},{:?})",
                old_bounds.min, old_bounds.max, new_bounds.min, new_bounds.max
            ),
        );
    }
    Ok(())
}

async fn compare_scalar_metrics(
    label: &str,
    sql: &str,
    columns: &[&str],
    old_pool: &MySqlPool,
    new_pool: &MySqlPool,
    checks: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    let old = fetch_optional_row(old_pool, sql).await?;
    let new = fetch_optional_row(new_pool, sql).await?;
    for column in columns {
        let old_value = string_cell(&old, column);
        let new_value = string_cell(&new, column);
        push_comparison(
            checks,
            warnings,
            format!("{label}.{column}"),
            old_value == new_value,
            format!("old={old_value:?} new={new_value:?}"),
        );
    }
    Ok(())
}

async fn compare_group_counts(
    label: &str,
    sql: &str,
    old_pool: &MySqlPool,
    new_pool: &MySqlPool,
    checks: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    let old = group_count_map(old_pool, sql).await?;
    let new = group_count_map(new_pool, sql).await?;
    push_comparison(
        checks,
        warnings,
        label.to_owned(),
        old == new,
        format!("old={old:?} new={new:?}"),
    );
    Ok(())
}

async fn table_fingerprint(pool: &MySqlPool, spec: &TableSpec) -> Result<String> {
    let sql = table_fingerprint_sql(spec);
    let rows = sqlx::query(&sql)
        .fetch_all(pool)
        .await
        .with_context(|| format!("failed fingerprint query for table {}", spec.table))?;

    let mut serialized_rows = Vec::with_capacity(rows.len());
    for row in rows {
        let values = spec
            .columns
            .iter()
            .map(|column| fingerprint_cell(&row, column))
            .collect();
        serialized_rows.push(values);
    }

    Ok(fingerprint_serialized_rows(&serialized_rows))
}

fn table_fingerprint_sql(spec: &TableSpec) -> String {
    let columns = spec
        .columns
        .iter()
        .map(|column| format!("CAST(`{column}` AS CHAR) AS `{column}`"))
        .collect::<Vec<_>>()
        .join(", ");
    format!("SELECT {columns} FROM `{}` ORDER BY `id` ASC", spec.table)
}

fn fingerprint_cell(row: &MySqlRow, column: &str) -> Option<String> {
    row.try_get::<Option<String>, _>(column)
        .ok()
        .flatten()
        .or_else(|| row.try_get::<String, _>(column).ok())
        .or_else(|| {
            row.try_get::<i64, _>(column)
                .ok()
                .map(|value| value.to_string())
        })
        .or_else(|| {
            row.try_get::<u64, _>(column)
                .ok()
                .map(|value| value.to_string())
        })
        .or_else(|| {
            row.try_get::<i32, _>(column)
                .ok()
                .map(|value| value.to_string())
        })
        .or_else(|| {
            row.try_get::<u32, _>(column)
                .ok()
                .map(|value| value.to_string())
        })
}

fn fingerprint_serialized_rows(rows: &[Vec<Option<String>>]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("rows:{}\n", rows.len()).as_bytes());
    for row in rows {
        hasher.update(format!("cols:{}\n", row.len()).as_bytes());
        for value in row {
            match value {
                Some(value) => {
                    hasher.update(b"S:");
                    hasher.update(value.len().to_string().as_bytes());
                    hasher.update(b":");
                    hasher.update(value.as_bytes());
                    hasher.update(b"\n");
                }
                None => hasher.update(b"N\n"),
            }
        }
    }
    format!("{:x}", hasher.finalize())
}

async fn group_count_map(pool: &MySqlPool, sql: &str) -> Result<BTreeMap<String, i64>> {
    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .with_context(|| format!("failed group count query: {sql}"))?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let row = Some(row);
            (
                string_cell(&row, "value").unwrap_or_else(|| "<NULL>".to_owned()),
                i64_cell(&row, "total").unwrap_or_default(),
            )
        })
        .collect())
}

fn push_comparison(
    checks: &mut Vec<String>,
    warnings: &mut Vec<String>,
    label: String,
    passed: bool,
    detail: String,
) {
    checks.push(format!(
        "{}: {}",
        label,
        if passed { "passed" } else { "failed" }
    ));
    if !passed {
        warnings.push(format!("{label} mismatch: {detail}"));
    }
}

async fn inspect_tables(pool: &MySqlPool) -> Result<Vec<TableSummary>> {
    let mut tables = Vec::with_capacity(EXPECTED_TABLES.len());
    for table in EXPECTED_TABLES {
        let sql = format!(
            "SELECT COUNT(*) AS row_count, MIN(`id`) AS min_id, MAX(`id`) AS max_id FROM `{table}`"
        );
        let row = fetch_optional_row(pool, &sql).await?;
        tables.push(TableSummary {
            name: (*table).to_owned(),
            row_count: i64_cell(&row, "row_count").unwrap_or_default(),
            min_id: i64_cell(&row, "min_id"),
            max_id: i64_cell(&row, "max_id"),
        });
    }
    Ok(tables)
}

async fn inspect_table(pool: &MySqlPool, table: &str) -> Result<TableSummary> {
    let sql = format!(
        "SELECT COUNT(*) AS row_count, MIN(`id`) AS min_id, MAX(`id`) AS max_id FROM `{table}`"
    );
    let row = fetch_optional_row(pool, &sql).await?;
    Ok(TableSummary {
        name: table.to_owned(),
        row_count: i64_cell(&row, "row_count").unwrap_or_default(),
        min_id: i64_cell(&row, "min_id"),
        max_id: i64_cell(&row, "max_id"),
    })
}

fn quoted_columns(columns: &[&str]) -> String {
    columns
        .iter()
        .map(|column| format!("`{column}`"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn cast_columns(columns: &[&str]) -> String {
    columns
        .iter()
        .map(|column| format!("CAST(`{column}` AS CHAR) AS `{column}`"))
        .collect::<Vec<_>>()
        .join(", ")
}

async fn inspect_duplicates(pool: &MySqlPool) -> Result<Vec<DuplicateSummary>> {
    let mut duplicates = Vec::with_capacity(DUPLICATE_CHECKS.len());
    for check in DUPLICATE_CHECKS {
        let select_value = if check.column.contains(',') {
            let columns = check
                .column
                .split(',')
                .map(|column| format!("COALESCE(CAST(`{column}` AS CHAR), '<NULL>')"))
                .collect::<Vec<_>>()
                .join(", ':', ");
            format!("CONCAT({columns})")
        } else {
            format!("CAST(`{}` AS CHAR)", check.column)
        };
        let group_by = check
            .column
            .split(',')
            .map(|column| format!("`{column}`"))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT {select_value} AS value, COUNT(*) AS total FROM `{}` GROUP BY {group_by} HAVING COUNT(*) > 1 ORDER BY total DESC, value ASC LIMIT 50",
            check.table
        );

        let rows = sqlx::query(&sql)
            .fetch_all(pool)
            .await
            .with_context(|| format!("failed duplicate check {}", check.label))?;
        duplicates.push(DuplicateSummary {
            name: check.label.to_owned(),
            rows: rows
                .into_iter()
                .map(|row| {
                    let row = Some(row);
                    DuplicateRow {
                        value: string_cell(&row, "value").unwrap_or_else(|| "<NULL>".to_owned()),
                        count: i64_cell(&row, "total").unwrap_or_default(),
                    }
                })
                .collect(),
        });
    }
    Ok(duplicates)
}

async fn inspect_orphans(pool: &MySqlPool) -> Result<Vec<OrphanSummary>> {
    let mut orphans = Vec::with_capacity(ORPHAN_CHECKS.len());
    for check in ORPHAN_CHECKS {
        let row = fetch_optional_row(pool, check.sql)
            .await
            .with_context(|| format!("failed orphan check {}", check.label))?;
        orphans.push(OrphanSummary {
            name: check.label.to_owned(),
            count: i64_cell(&row, "total").unwrap_or_default(),
        });
    }
    Ok(orphans)
}

async fn inspect_status_distributions(pool: &MySqlPool) -> Result<Vec<StatusDistribution>> {
    let mut distributions = Vec::with_capacity(STATUS_CHECKS.len());
    for check in STATUS_CHECKS {
        let sql = format!(
            "SELECT CAST(`{}` AS CHAR) AS value, COUNT(*) AS total FROM `{}` GROUP BY `{}` ORDER BY value ASC",
            check.column, check.table, check.column
        );
        let rows = sqlx::query(&sql)
            .fetch_all(pool)
            .await
            .with_context(|| format!("failed status distribution {}", check.label))?;
        distributions.push(StatusDistribution {
            field: check.label.to_owned(),
            values: rows
                .into_iter()
                .map(|row| {
                    let row = Some(row);
                    StatusValue {
                        value: string_cell(&row, "value").unwrap_or_else(|| "<NULL>".to_owned()),
                        count: i64_cell(&row, "total").unwrap_or_default(),
                    }
                })
                .collect(),
        });
    }
    Ok(distributions)
}

async fn inspect_date_bounds(pool: &MySqlPool) -> Result<Vec<DateBounds>> {
    let mut bounds = Vec::with_capacity(DATE_BOUND_CHECKS.len());
    for check in DATE_BOUND_CHECKS {
        let sql = format!(
            "SELECT MIN(`{}`) AS min_value, MAX(`{}`) AS max_value FROM `{}`",
            check.column, check.column, check.table
        );
        let row = fetch_optional_row(pool, &sql)
            .await
            .with_context(|| format!("failed date bound check {}", check.label))?;
        bounds.push(DateBounds {
            field: check.label.to_owned(),
            min: string_cell(&row, "min_value"),
            max: string_cell(&row, "max_value"),
        });
    }
    Ok(bounds)
}

async fn inspect_avatar_diff(pool: &MySqlPool, files: &AvatarFileInventory) -> Result<AvatarDiff> {
    let rows = sqlx::query("SELECT CAST(`filename` AS CHAR) AS filename FROM `avatar`")
        .fetch_all(pool)
        .await
        .with_context(|| "failed to inspect avatar database filenames")?;

    let db_files = rows
        .into_iter()
        .filter_map(|row| string_cell(&Some(row), "filename"))
        .map(|value| normalize_avatar_name(&value))
        .collect::<BTreeSet<_>>();
    let disk_files = files
        .files
        .iter()
        .map(|file| normalize_avatar_name(&file.relative_path))
        .collect::<BTreeSet<_>>();

    Ok(AvatarDiff {
        db_record_count: db_files.len() as u64,
        disk_file_count: disk_files.len() as u64,
        db_missing_on_disk: db_files
            .difference(&disk_files)
            .take(100)
            .cloned()
            .collect(),
        disk_missing_in_db: disk_files
            .difference(&db_files)
            .take(100)
            .cloned()
            .collect(),
    })
}

async fn inspect_avatar_files(dir: &Path) -> Result<AvatarFileInventory> {
    let dir = dir.to_path_buf();
    task::spawn_blocking(move || inspect_avatar_files_blocking(&dir))
        .await
        .with_context(|| "failed to join avatar inventory task")?
}

fn inspect_avatar_files_blocking(dir: &Path) -> Result<AvatarFileInventory> {
    if !dir.exists() {
        return Ok(AvatarFileInventory {
            directory: dir.display().to_string(),
            exists: false,
            file_count: 0,
            total_bytes: 0,
            files: Vec::new(),
        });
    }

    let mut files = Vec::new();
    let mut total_bytes = 0;
    for entry in WalkDir::new(dir).sort_by_file_name() {
        let entry = entry.with_context(|| format!("failed to read {}", dir.display()))?;
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let metadata = std::fs::metadata(path)
            .with_context(|| format!("failed metadata {}", path.display()))?;
        let bytes =
            std::fs::read(path).with_context(|| format!("failed read {}", path.display()))?;
        total_bytes += metadata.len();
        files.push(AvatarFileHash {
            relative_path: path
                .strip_prefix(dir)
                .unwrap_or(path)
                .to_string_lossy()
                .trim_start_matches('/')
                .to_owned(),
            bytes: metadata.len(),
            sha256: format!("{:x}", Sha256::digest(&bytes)),
        });
    }

    Ok(AvatarFileInventory {
        directory: dir.display().to_string(),
        exists: true,
        file_count: files.len() as u64,
        total_bytes,
        files,
    })
}

fn file_hash_map(files: &AvatarFileInventory) -> BTreeMap<String, String> {
    files
        .files
        .iter()
        .map(|file| {
            (
                normalize_avatar_name(&file.relative_path),
                file.sha256.clone(),
            )
        })
        .collect()
}

fn normalize_avatar_name(value: &str) -> String {
    value
        .rsplit('/')
        .next()
        .unwrap_or(value)
        .trim_start_matches('\\')
        .to_owned()
}

async fn fetch_optional_row(pool: &MySqlPool, sql: &str) -> Result<Option<MySqlRow>> {
    sqlx::query(sql)
        .fetch_optional(pool)
        .await
        .with_context(|| format!("failed query: {sql}"))
}

fn i64_cell(row: &Option<MySqlRow>, column: &str) -> Option<i64> {
    let row = row.as_ref()?;
    row.try_get::<i64, _>(column)
        .ok()
        .or_else(|| {
            row.try_get::<u64, _>(column)
                .ok()
                .and_then(|value| value.try_into().ok())
        })
        .or_else(|| row.try_get::<u32, _>(column).ok().map(i64::from))
        .or_else(|| row.try_get::<i32, _>(column).ok().map(i64::from))
}

fn string_cell(row: &Option<MySqlRow>, column: &str) -> Option<String> {
    let row = row.as_ref()?;
    string_cell_ref(row, column)
}

fn string_cell_ref(row: &MySqlRow, column: &str) -> Option<String> {
    row.try_get::<String, _>(column)
        .ok()
        .or_else(|| {
            row.try_get::<i64, _>(column)
                .ok()
                .map(|value| value.to_string())
        })
        .or_else(|| {
            row.try_get::<u64, _>(column)
                .ok()
                .map(|value| value.to_string())
        })
        .or_else(|| {
            row.try_get::<i32, _>(column)
                .ok()
                .map(|value| value.to_string())
        })
}

fn print_report<T>(report: &T, format: OutputFormat) -> Result<()>
where
    T: Serialize + TextReport,
{
    match format {
        OutputFormat::Json => println!("{}", serde_json::to_string_pretty(report)?),
        OutputFormat::Text => println!("{}", report.to_text()),
    }
    Ok(())
}

pub fn mask_database_url(url: &str) -> String {
    let Some(scheme_end) = url.find("://") else {
        return url.to_owned();
    };
    let prefix_end = scheme_end + 3;
    let Some(at_offset) = url[prefix_end..].find('@') else {
        return url.to_owned();
    };

    let credentials = &url[prefix_end..prefix_end + at_offset];
    let Some(colon_offset) = credentials.find(':') else {
        return url.to_owned();
    };

    let user = &credentials[..colon_offset];
    let rest = &url[prefix_end + at_offset..];
    format!("{}{}:***{}", &url[..prefix_end], user, rest)
}

fn generated_at() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("unix:{seconds}")
}

fn rollback_freeze_controls() -> Vec<String> {
    vec![
        "freeze legacy admin writes and keep the failed target database untouched for forensic diffing".to_owned(),
        "disable new desktop/web cutover traffic before any restore command runs".to_owned(),
        "record the release commit, old database dump path, schema dump path, and avatar archive path".to_owned(),
    ]
}

fn rollback_required_artifacts() -> Vec<String> {
    vec![
        "full old MySQL dump created with --single-transaction --routines --triggers --default-character-set=utf8mb4".to_owned(),
        "old schema-only dump created with mysqldump --no-data for structure comparison".to_owned(),
        "avatar archive from adminYh-server uploads/avatar plus SHA256 inventory generated by inspect-old".to_owned(),
        "release gate log containing default, database, migration, Docker, Tauri, E2E, and coverage command results".to_owned(),
    ]
}

fn rollback_restore_steps() -> Vec<String> {
    vec![
        "create a clean rollback target database; do not restore over the failed target database in place".to_owned(),
        "restore the old MySQL dump into the clean rollback target database".to_owned(),
        "restore the avatar archive into a clean upload directory owned by the new runtime user".to_owned(),
        "point the API or desktop sidecar to the rollback target database and restored avatar directory".to_owned(),
    ]
}

fn rollback_verification_steps() -> Vec<String> {
    vec![
        "run inspect-old against the restored database and avatar directory".to_owned(),
        "run migrate --dry-run against a fresh shadow database before any new apply attempt".to_owned(),
        "run verify and verify-files; row counts, ID ranges, table fingerprints, business sums, status distributions, and avatar hashes must pass".to_owned(),
        "run API compatibility, Docker health, Tauri sidecar, Playwright E2E, and frontend coverage gates again".to_owned(),
    ]
}

fn rollback_cutover_criteria() -> Vec<String> {
    vec![
        "all blocking migration verification checks are passed with no unreviewed warnings".to_owned(),
        "legacy-compatible login, menu, company, order, receipt, user, role, chart, memory, and avatar routes pass".to_owned(),
        "operators can open the restored app, create a test order, view receipt data, and load user avatars".to_owned(),
        "only then switch traffic; keep the failed target database and logs until postmortem is complete".to_owned(),
    ]
}

fn rollback_failure_record() -> Vec<String> {
    vec![
        "record commit SHA, command, sanitized OLD_DATABASE_URL/NEW_DATABASE_URL, avatar dirs, and exact failing phase".to_owned(),
        "attach the rollback-plan JSON, inspect-old JSON, verify JSON, verify-files JSON, and relevant service logs".to_owned(),
        "classify the failure as schema, data quality, file migration, API compatibility, Docker, Tauri, or E2E before retry".to_owned(),
    ]
}

trait TextReport {
    fn to_text(&self) -> String;
}

impl TextReport for MigrationReport {
    fn to_text(&self) -> String {
        let mut output = vec![
            format!("command={}", self.command),
            format!("generated_at={}", self.generated_at),
            format!("old_database={}", self.old_database.url_masked),
        ];

        if let Some(new_database) = &self.new_database {
            output.push(format!("new_database={}", new_database.url_masked));
        }

        output.push("tables:".to_owned());
        for table in &self.tables {
            output.push(format!(
                "- {} rows={} min_id={:?} max_id={:?}",
                table.name, table.row_count, table.min_id, table.max_id
            ));
        }

        if let Some(preflight) = &self.target_preflight {
            output.push(format!(
                "target_preflight: is_empty={} populated_tables={}",
                preflight.is_empty,
                preflight.populated_tables.len()
            ));
            for table in &preflight.populated_tables {
                output.push(format!("- {} rows={}", table.name, table.row_count));
            }
        }

        output.push("duplicates:".to_owned());
        for duplicate in &self.duplicates {
            output.push(format!(
                "- {} rows={}",
                duplicate.name,
                duplicate.rows.len()
            ));
        }

        output.push("orphans:".to_owned());
        for orphan in &self.orphans {
            output.push(format!("- {} count={}", orphan.name, orphan.count));
        }

        output.push("status_distributions:".to_owned());
        for status in &self.status_distributions {
            output.push(format!("- {} values={}", status.field, status.values.len()));
        }

        if let Some(files) = &self.avatar_files {
            output.push(format!(
                "avatar_files: dir={} exists={} files={} bytes={}",
                files.directory, files.exists, files.file_count, files.total_bytes
            ));
        }

        for warning in &self.warnings {
            output.push(format!("WARN: {warning}"));
        }

        output.join("\n")
    }
}

impl TextReport for VerifyReport {
    fn to_text(&self) -> String {
        let mut output = vec![
            format!("command={}", self.command),
            format!("generated_at={}", self.generated_at),
            format!("old_database={}", self.old_database.url_masked),
            format!("new_database={}", self.new_database.url_masked),
            format!("status={}", self.status),
            "checks:".to_owned(),
        ];
        output.extend(self.checks.iter().map(|check| format!("- {check}")));
        output.extend(
            self.warnings
                .iter()
                .map(|warning| format!("WARN: {warning}")),
        );
        output.join("\n")
    }
}

impl TextReport for FileVerifyReport {
    fn to_text(&self) -> String {
        [
            format!("command={}", self.command),
            format!("generated_at={}", self.generated_at),
            format!("status={}", self.status),
            format!(
                "old_files={} new_files={}",
                self.old_avatar_files.file_count, self.new_avatar_files.file_count
            ),
            format!("missing_in_new={}", self.missing_in_new.len()),
            format!("extra_in_new={}", self.extra_in_new.len()),
            format!("changed={}", self.changed.len()),
        ]
        .join("\n")
    }
}

impl TextReport for RollbackPlanReport {
    fn to_text(&self) -> String {
        let mut output = vec![
            format!("command={}", self.command),
            format!("generated_at={}", self.generated_at),
        ];
        output.push("freeze_controls:".to_owned());
        output.extend(self.freeze_controls.iter().map(|step| format!("- {step}")));
        output.push("required_artifacts:".to_owned());
        output.extend(
            self.required_artifacts
                .iter()
                .map(|step| format!("- {step}")),
        );
        output.push("restore_steps:".to_owned());
        output.extend(self.restore_steps.iter().map(|step| format!("- {step}")));
        output.push("verification_steps:".to_owned());
        output.extend(
            self.verification_steps
                .iter()
                .map(|step| format!("- {step}")),
        );
        output.push("cutover_criteria:".to_owned());
        output.extend(self.cutover_criteria.iter().map(|step| format!("- {step}")));
        output.push("failure_record:".to_owned());
        output.extend(self.failure_record.iter().map(|step| format!("- {step}")));
        output.join("\n")
    }
}

#[derive(Debug, Serialize)]
pub struct MigrationReport {
    pub command: String,
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    #[serde(rename = "oldDatabase")]
    pub old_database: DatabaseRef,
    #[serde(rename = "newDatabase", skip_serializing_if = "Option::is_none")]
    pub new_database: Option<DatabaseRef>,
    pub tables: Vec<TableSummary>,
    pub duplicates: Vec<DuplicateSummary>,
    pub orphans: Vec<OrphanSummary>,
    #[serde(rename = "statusDistributions")]
    pub status_distributions: Vec<StatusDistribution>,
    #[serde(rename = "dateBounds")]
    pub date_bounds: Vec<DateBounds>,
    #[serde(rename = "avatarFiles", skip_serializing_if = "Option::is_none")]
    pub avatar_files: Option<AvatarFileInventory>,
    #[serde(rename = "avatarDiff", skip_serializing_if = "Option::is_none")]
    pub avatar_diff: Option<AvatarDiff>,
    #[serde(rename = "targetPreflight", skip_serializing_if = "Option::is_none")]
    pub target_preflight: Option<TargetPreflight>,
    #[serde(rename = "copySummaries", skip_serializing_if = "Vec::is_empty")]
    pub copy_summaries: Vec<TableCopySummary>,
    #[serde(rename = "avatarFileCopy", skip_serializing_if = "Option::is_none")]
    pub avatar_file_copy: Option<FileCopySummary>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct VerifyReport {
    pub command: String,
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    #[serde(rename = "oldDatabase")]
    pub old_database: DatabaseRef,
    #[serde(rename = "newDatabase")]
    pub new_database: DatabaseRef,
    pub status: String,
    pub checks: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct FileVerifyReport {
    pub command: String,
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    pub status: String,
    #[serde(rename = "oldAvatarFiles")]
    pub old_avatar_files: AvatarFileInventory,
    #[serde(rename = "newAvatarFiles")]
    pub new_avatar_files: AvatarFileInventory,
    #[serde(rename = "missingInNew")]
    pub missing_in_new: Vec<String>,
    #[serde(rename = "extraInNew")]
    pub extra_in_new: Vec<String>,
    pub changed: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct RollbackPlanReport {
    pub command: String,
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    #[serde(rename = "freezeControls")]
    pub freeze_controls: Vec<String>,
    #[serde(rename = "requiredArtifacts")]
    pub required_artifacts: Vec<String>,
    #[serde(rename = "restoreSteps")]
    pub restore_steps: Vec<String>,
    #[serde(rename = "verificationSteps")]
    pub verification_steps: Vec<String>,
    #[serde(rename = "cutoverCriteria")]
    pub cutover_criteria: Vec<String>,
    #[serde(rename = "failureRecord")]
    pub failure_record: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct DatabaseRef {
    #[serde(rename = "urlMasked")]
    pub url_masked: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct TableSummary {
    pub name: String,
    #[serde(rename = "rowCount")]
    pub row_count: i64,
    #[serde(rename = "minId")]
    pub min_id: Option<i64>,
    #[serde(rename = "maxId")]
    pub max_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct TargetPreflight {
    #[serde(rename = "isEmpty")]
    pub is_empty: bool,
    #[serde(rename = "populatedTables")]
    pub populated_tables: Vec<TableSummary>,
    pub tables: Vec<TableSummary>,
}

#[derive(Debug, Serialize)]
pub struct TableCopySummary {
    pub table: String,
    #[serde(rename = "copiedRows")]
    pub copied_rows: i64,
    #[serde(rename = "rowCount")]
    pub row_count: i64,
    #[serde(rename = "minId")]
    pub min_id: Option<i64>,
    #[serde(rename = "maxId")]
    pub max_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct FileCopySummary {
    #[serde(rename = "oldDirectory")]
    pub old_directory: String,
    #[serde(rename = "newDirectory")]
    pub new_directory: String,
    #[serde(rename = "copiedFiles")]
    pub copied_files: u64,
    #[serde(rename = "copiedBytes")]
    pub copied_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct DuplicateSummary {
    pub name: String,
    pub rows: Vec<DuplicateRow>,
}

#[derive(Debug, Serialize)]
pub struct DuplicateRow {
    pub value: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct OrphanSummary {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct StatusDistribution {
    pub field: String,
    pub values: Vec<StatusValue>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct StatusValue {
    pub value: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct DateBounds {
    pub field: String,
    pub min: Option<String>,
    pub max: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AvatarFileInventory {
    pub directory: String,
    pub exists: bool,
    #[serde(rename = "fileCount")]
    pub file_count: u64,
    #[serde(rename = "totalBytes")]
    pub total_bytes: u64,
    pub files: Vec<AvatarFileHash>,
}

#[derive(Debug, Serialize)]
pub struct AvatarFileHash {
    #[serde(rename = "relativePath")]
    pub relative_path: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Serialize)]
pub struct AvatarDiff {
    #[serde(rename = "dbRecordCount")]
    pub db_record_count: u64,
    #[serde(rename = "diskFileCount")]
    pub disk_file_count: u64,
    #[serde(rename = "dbMissingOnDisk")]
    pub db_missing_on_disk: Vec<String>,
    #[serde(rename = "diskMissingInDb")]
    pub disk_missing_in_db: Vec<String>,
}

struct DuplicateCheck {
    table: &'static str,
    column: &'static str,
    label: &'static str,
}

struct OrphanCheck {
    label: &'static str,
    sql: &'static str,
}

struct StatusCheck {
    table: &'static str,
    column: &'static str,
    label: &'static str,
}

struct DateBoundCheck {
    table: &'static str,
    column: &'static str,
    label: &'static str,
}

struct TableSpec {
    table: &'static str,
    columns: &'static [&'static str],
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;
    use std::sync::atomic::{AtomicU64, Ordering};
    use tokio::fs;

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn cli_definition_is_valid() {
        Cli::command().debug_assert();
    }

    #[test]
    fn masks_database_password() {
        assert_eq!(
            mask_database_url("mysql://root:secret@127.0.0.1:3306/admin_yh"),
            "mysql://root:***@127.0.0.1:3306/admin_yh"
        );
    }

    #[test]
    fn leaves_url_without_password_unchanged() {
        assert_eq!(
            mask_database_url("mysql://127.0.0.1:3306/admin_yh"),
            "mysql://127.0.0.1:3306/admin_yh"
        );
    }

    #[test]
    fn parses_inspect_old_command() {
        let cli = Cli::try_parse_from([
            "admin-migration",
            "inspect-old",
            "--old",
            "mysql://root:secret@127.0.0.1/admin",
            "--old-avatar-dir",
            "/tmp/avatar",
            "--format",
            "json",
        ])
        .expect("cli parses");

        match cli.command {
            Commands::InspectOld {
                old,
                old_avatar_dir,
                format,
            } => {
                assert_eq!(old, "mysql://root:secret@127.0.0.1/admin");
                assert_eq!(old_avatar_dir, Some(PathBuf::from("/tmp/avatar")));
                assert_eq!(format, OutputFormat::Json);
            }
            _ => panic!("unexpected command"),
        }
    }

    #[test]
    fn parses_rollback_plan_command() {
        let cli = Cli::try_parse_from(["admin-migration", "rollback-plan", "--format", "json"])
            .expect("rollback plan cli parses");

        match cli.command {
            Commands::RollbackPlan { format } => {
                assert_eq!(format, OutputFormat::Json);
            }
            _ => panic!("unexpected command"),
        }
    }

    #[test]
    fn rollback_plan_documents_restore_and_verify_steps() {
        let report = RollbackPlanReport {
            command: "rollback-plan".to_owned(),
            generated_at: "test".to_owned(),
            freeze_controls: rollback_freeze_controls(),
            required_artifacts: rollback_required_artifacts(),
            restore_steps: rollback_restore_steps(),
            verification_steps: rollback_verification_steps(),
            cutover_criteria: rollback_cutover_criteria(),
            failure_record: rollback_failure_record(),
        };

        let text = report.to_text();
        assert!(text.contains("freeze legacy admin writes"));
        assert!(text.contains("release gate log"));
        assert!(text.contains("restore the old MySQL dump"));
        assert!(text.contains("verify-files"));
        assert!(text.contains("legacy-compatible login"));
        assert!(text.contains("classify the failure"));
    }

    #[test]
    fn target_preflight_marks_populated_tables_for_dry_run_reports() {
        let preflight = build_target_preflight(vec![
            TableSummary {
                name: "user".to_owned(),
                row_count: 0,
                min_id: None,
                max_id: None,
            },
            TableSummary {
                name: "order_list".to_owned(),
                row_count: 3,
                min_id: Some(1),
                max_id: Some(3),
            },
        ]);

        assert!(!preflight.is_empty);
        assert_eq!(preflight.populated_tables.len(), 1);
        assert_eq!(preflight.populated_tables[0].name, "order_list");
        assert_eq!(preflight.populated_tables[0].row_count, 3);
    }

    #[test]
    fn target_preflight_marks_empty_schema_for_dry_run_reports() {
        let preflight = build_target_preflight(vec![TableSummary {
            name: "user".to_owned(),
            row_count: 0,
            min_id: None,
            max_id: None,
        }]);

        assert!(preflight.is_empty);
        assert!(preflight.populated_tables.is_empty());
    }

    #[test]
    fn table_fingerprint_sql_uses_whitelisted_columns_and_stable_order() {
        let spec = TableSpec {
            table: "receipt",
            columns: &["id", "oddnumber", "recoverystate"],
        };

        assert_eq!(
            table_fingerprint_sql(&spec),
            "SELECT CAST(`id` AS CHAR) AS `id`, CAST(`oddnumber` AS CHAR) AS `oddnumber`, CAST(`recoverystate` AS CHAR) AS `recoverystate` FROM `receipt` ORDER BY `id` ASC"
        );
    }

    #[test]
    fn migration_specs_cover_every_compat_schema_table_and_column() {
        let schema =
            include_str!("../../admin-db/src/migrations/202607010001_init_compat_schema.sql");
        let schema_tables = parse_schema_tables(schema);
        let expected_tables = EXPECTED_TABLES.iter().copied().collect::<BTreeSet<_>>();
        let spec_tables = TABLE_SPECS
            .iter()
            .map(|spec| spec.table)
            .collect::<BTreeSet<_>>();

        assert_eq!(
            schema_tables.keys().copied().collect::<BTreeSet<_>>(),
            expected_tables,
            "baseline schema tables must stay aligned with migration EXPECTED_TABLES"
        );
        assert_eq!(
            spec_tables, expected_tables,
            "migration TABLE_SPECS must cover every expected legacy table"
        );

        for spec in TABLE_SPECS {
            let schema_columns = schema_tables
                .get(spec.table)
                .unwrap_or_else(|| panic!("schema should declare `{}`", spec.table));
            let spec_columns = spec.columns.iter().copied().collect::<BTreeSet<_>>();

            assert_eq!(
                schema_columns, &spec_columns,
                "migration columns for `{}` must match compat schema columns exactly",
                spec.table
            );
            assert!(
                spec.columns.contains(&"id"),
                "migration table `{}` must copy legacy ids so auto-increment can be restored",
                spec.table
            );
        }
    }

    #[test]
    fn row_fingerprint_distinguishes_values_nulls_and_order() {
        let baseline = fingerprint_serialized_rows(&[
            vec![Some("1".to_owned()), Some("A".to_owned()), None],
            vec![
                Some("2".to_owned()),
                Some("B".to_owned()),
                Some("".to_owned()),
            ],
        ]);

        let same = fingerprint_serialized_rows(&[
            vec![Some("1".to_owned()), Some("A".to_owned()), None],
            vec![
                Some("2".to_owned()),
                Some("B".to_owned()),
                Some("".to_owned()),
            ],
        ]);
        let changed_value = fingerprint_serialized_rows(&[
            vec![Some("1".to_owned()), Some("A".to_owned()), None],
            vec![
                Some("2".to_owned()),
                Some("C".to_owned()),
                Some("".to_owned()),
            ],
        ]);
        let changed_null = fingerprint_serialized_rows(&[
            vec![
                Some("1".to_owned()),
                Some("A".to_owned()),
                Some("".to_owned()),
            ],
            vec![
                Some("2".to_owned()),
                Some("B".to_owned()),
                Some("".to_owned()),
            ],
        ]);
        let changed_order = fingerprint_serialized_rows(&[
            vec![
                Some("2".to_owned()),
                Some("B".to_owned()),
                Some("".to_owned()),
            ],
            vec![Some("1".to_owned()), Some("A".to_owned()), None],
        ]);

        assert_eq!(baseline, same);
        assert_ne!(baseline, changed_value);
        assert_ne!(baseline, changed_null);
        assert_ne!(baseline, changed_order);
    }

    #[tokio::test]
    async fn inventories_avatar_files_with_hashes() {
        let root = unique_temp_dir();
        fs::create_dir_all(root.join("nested")).await.unwrap();
        fs::write(root.join("default.jpg"), b"default")
            .await
            .unwrap();
        fs::write(root.join("nested").join("user.jpg"), b"user")
            .await
            .unwrap();

        let inventory = inspect_avatar_files(&root).await.unwrap();
        assert!(inventory.exists);
        assert_eq!(inventory.file_count, 2);
        assert_eq!(inventory.total_bytes, 11);
        assert!(inventory
            .files
            .iter()
            .any(|file| file.relative_path == "default.jpg"));
        assert!(inventory
            .files
            .iter()
            .any(|file| file.relative_path == "nested/user.jpg"));

        fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn verify_files_marks_identical_avatar_dirs_passed() {
        let old_root = unique_temp_dir();
        let new_root = unique_temp_dir();
        fs::create_dir_all(&old_root).await.unwrap();
        fs::create_dir_all(&new_root).await.unwrap();
        fs::write(old_root.join("default.jpg"), b"default")
            .await
            .unwrap();
        fs::write(new_root.join("default.jpg"), b"default")
            .await
            .unwrap();

        let report = verify_files(&old_root, &new_root).await.unwrap();
        assert_eq!(report.status, "passed");
        assert!(report.missing_in_new.is_empty());
        assert!(report.extra_in_new.is_empty());
        assert!(report.changed.is_empty());

        fs::remove_dir_all(old_root).await.unwrap();
        fs::remove_dir_all(new_root).await.unwrap();
    }

    #[tokio::test]
    async fn verify_files_marks_missing_extra_and_changed_files_failed() {
        let old_root = unique_temp_dir();
        let new_root = unique_temp_dir();
        fs::create_dir_all(old_root.join("nested")).await.unwrap();
        fs::create_dir_all(&new_root).await.unwrap();
        fs::write(old_root.join("default.jpg"), b"default")
            .await
            .unwrap();
        fs::write(old_root.join("nested").join("user.jpg"), b"user")
            .await
            .unwrap();
        fs::write(old_root.join("changed.jpg"), b"old")
            .await
            .unwrap();
        fs::write(new_root.join("default.jpg"), b"default")
            .await
            .unwrap();
        fs::write(new_root.join("changed.jpg"), b"new")
            .await
            .unwrap();
        fs::write(new_root.join("extra.jpg"), b"extra")
            .await
            .unwrap();

        let report = verify_files(&old_root, &new_root).await.unwrap();
        assert_eq!(report.status, "failed");
        assert_eq!(report.missing_in_new, vec!["user.jpg"]);
        assert_eq!(report.extra_in_new, vec!["extra.jpg"]);
        assert_eq!(report.changed, vec!["changed.jpg"]);
        assert!(report.to_text().contains("status=failed"));

        fs::remove_dir_all(old_root).await.unwrap();
        fs::remove_dir_all(new_root).await.unwrap();
    }

    fn unique_temp_dir() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "admin-migration-test-{}-{suffix}-{counter}",
            std::process::id()
        ))
    }

    fn parse_schema_tables(schema: &str) -> BTreeMap<&str, BTreeSet<&str>> {
        let mut tables = BTreeMap::new();
        let lines = schema.lines().collect::<Vec<_>>();
        let mut index = 0;

        while index < lines.len() {
            let line = lines[index].trim();
            let Some(table) = line
                .strip_prefix("CREATE TABLE IF NOT EXISTS `")
                .and_then(|value| value.split_once('`').map(|(table, _)| table))
            else {
                index += 1;
                continue;
            };

            index += 1;
            let mut columns = BTreeSet::new();
            while index < lines.len() {
                let column_line = lines[index].trim();
                if column_line.starts_with(")") {
                    break;
                }
                if let Some(column) = column_line
                    .strip_prefix('`')
                    .and_then(|value| value.split_once('`').map(|(column, _)| column))
                {
                    columns.insert(column);
                }
                index += 1;
            }
            tables.insert(table, columns);
        }

        tables
    }
}

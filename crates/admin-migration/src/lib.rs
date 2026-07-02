use std::{
    collections::{BTreeMap, BTreeSet},
    fmt::{self, Display},
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
        old: String,
        #[arg(long)]
        new: String,
        #[arg(long)]
        old_avatar_dir: Option<PathBuf>,
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
            old,
            new,
            old_avatar_dir,
            format,
        } => {
            if !dry_run {
                return Err(anyhow!(
                    "apply migration is intentionally disabled in this slice; rerun with --dry-run"
                ));
            }

            let mut report = inspect_old(&old, old_avatar_dir.as_deref()).await?;
            report.command = "migrate --dry-run".to_owned();
            report.new_database = Some(DatabaseRef {
                url_masked: mask_database_url(&new),
            });
            report
                .warnings
                .push("dry-run only: no rows or files were written".to_owned());
            print_report(&report, format)
        }
        Commands::Verify { old, new, format } => {
            let report = VerifyReport {
                command: "verify".to_owned(),
                generated_at: generated_at(),
                old_database: DatabaseRef {
                    url_masked: mask_database_url(&old),
                },
                new_database: DatabaseRef {
                    url_masked: mask_database_url(&new),
                },
                status: "pending".to_owned(),
                checks: vec![
                    "row counts".to_owned(),
                    "max ids".to_owned(),
                    "freight and receipt totals".to_owned(),
                    "receipt status distributions".to_owned(),
                    "role and permission distributions".to_owned(),
                ],
                warnings: vec![
                    "verify is scaffolded until the new SQLx schema is finalized".to_owned(),
                ],
            };
            print_report(&report, format)
        }
        Commands::VerifyFiles {
            old_avatar_dir,
            new_avatar_dir,
            format,
        } => {
            let report = verify_files(&old_avatar_dir, &new_avatar_dir).await?;
            print_report(&report, format)
        }
        Commands::RollbackPlan { format } => {
            let report = RollbackPlanReport {
                command: "rollback-plan".to_owned(),
                generated_at: generated_at(),
                steps: vec![
                    "stop new writes and preserve current failed target database".to_owned(),
                    "restore old MySQL dump into a clean target database".to_owned(),
                    "restore avatar archive into the target upload directory".to_owned(),
                    "run inspect-old, migrate --dry-run, verify, and verify-files again".to_owned(),
                    "switch traffic only after all blocking checks pass".to_owned(),
                ],
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

    let missing_in_new = old_hashes
        .keys()
        .filter(|path| !new_hashes.contains_key(*path))
        .cloned()
        .collect();
    let extra_in_new = new_hashes
        .keys()
        .filter(|path| !old_hashes.contains_key(*path))
        .cloned()
        .collect();
    let changed = old_hashes
        .iter()
        .filter_map(|(path, old_hash)| {
            new_hashes
                .get(path)
                .filter(|new_hash| *new_hash != old_hash)
                .map(|_| path.clone())
        })
        .collect();

    Ok(FileVerifyReport {
        command: "verify-files".to_owned(),
        generated_at: generated_at(),
        old_avatar_files: old_files,
        new_avatar_files: new_files,
        missing_in_new,
        extra_in_new,
        changed,
    })
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
            "steps:".to_owned(),
        ];
        output.extend(self.steps.iter().map(|step| format!("- {step}")));
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
    pub steps: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct DatabaseRef {
    #[serde(rename = "urlMasked")]
    pub url_masked: String,
}

#[derive(Debug, Serialize)]
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

#[derive(Debug, Serialize)]
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

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;
    use tokio::fs;

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

    fn unique_temp_dir() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("admin-migration-test-{suffix}"))
    }
}

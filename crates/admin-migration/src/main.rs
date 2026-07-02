use std::process::ExitCode;

use admin_migration::{run_cli, Cli};
use clap::Parser;

#[tokio::main]
async fn main() -> ExitCode {
    match run_cli(Cli::parse()).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error:#}");
            ExitCode::from(1)
        }
    }
}

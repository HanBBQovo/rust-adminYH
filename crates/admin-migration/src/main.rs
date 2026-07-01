use std::{env, process::ExitCode};

#[tokio::main]
async fn main() -> ExitCode {
    let command = env::args().nth(1).unwrap_or_else(|| "help".to_owned());

    match command.as_str() {
        "inspect-old" | "migrate" | "verify" | "verify-files" | "rollback-plan" => {
            eprintln!(
                "admin-migration {command}: migration command scaffold is ready; database audit implementation is pending old schema export"
            );
            ExitCode::SUCCESS
        }
        "help" | "--help" | "-h" => {
            println!(
                "Usage: admin-migration <inspect-old|migrate|verify|verify-files|rollback-plan>"
            );
            ExitCode::SUCCESS
        }
        unknown => {
            eprintln!("unknown migration command: {unknown}");
            ExitCode::from(2)
        }
    }
}

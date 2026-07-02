use std::{
    env,
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};

use tauri::{Manager, RunEvent};

const ADMIN_API_BIN_NAME: &str = "admin-api";
const ADMIN_API_PORT: &str = "16824";
const ADMIN_API_HEALTH_URL: &str = "http://127.0.0.1:16824/api/health";

#[derive(Debug, Default)]
struct SidecarState {
    child: Mutex<Option<Child>>,
    diagnostics: Mutex<Vec<String>>,
}

impl SidecarState {
    fn push_diagnostic(&self, message: impl Into<String>) {
        let mut diagnostics = self
            .diagnostics
            .lock()
            .expect("sidecar diagnostics lock poisoned");
        diagnostics.push(message.into());
        if diagnostics.len() > 200 {
            let overflow = diagnostics.len() - 200;
            diagnostics.drain(0..overflow);
        }
    }

    fn stop(&self) {
        let mut child = self.child.lock().expect("sidecar child lock poisoned");
        if let Some(mut child) = child.take() {
            match child.kill() {
                Ok(()) => self.push_diagnostic("admin-api sidecar kill requested"),
                Err(error) => {
                    self.push_diagnostic(format!("admin-api sidecar kill failed: {error}"));
                }
            }
            let _ = child.wait();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sidecar_state = Arc::new(SidecarState::default());

    tauri::Builder::default()
        .manage(Arc::clone(&sidecar_state))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = app.state::<Arc<SidecarState>>().inner().clone();
            match start_admin_api_sidecar(app, Arc::clone(&state)) {
                Ok(()) => state.push_diagnostic(format!(
                    "admin-api sidecar started; health={ADMIN_API_HEALTH_URL}"
                )),
                Err(error) => {
                    state.push_diagnostic(format!("admin-api sidecar startup failed: {error}"));
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let state = window.state::<Arc<SidecarState>>().inner().clone();
                state.stop();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building adminYH desktop")
        .run(move |app_handle, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                let state = app_handle.state::<Arc<SidecarState>>().inner().clone();
                state.stop();
            }
        });
}

fn start_admin_api_sidecar<R: tauri::Runtime>(
    app: &tauri::App<R>,
    state: Arc<SidecarState>,
) -> Result<(), String> {
    if env::var("ADMIN_YH_DESKTOP_DISABLE_SIDECAR").as_deref() == Ok("true") {
        state.push_diagnostic(
            "admin-api sidecar disabled by ADMIN_YH_DESKTOP_DISABLE_SIDECAR=true",
        );
        return Ok(());
    }

    if is_health_available() {
        state.push_diagnostic(format!(
            "admin-api already reachable on {ADMIN_API_HEALTH_URL}; sidecar spawn skipped"
        ));
        return Ok(());
    }

    let binary_path = resolve_admin_api_binary(app)?;
    let avatar_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir failed: {error}"))?
        .join("uploads")
        .join("avatar");
    std::fs::create_dir_all(&avatar_dir)
        .map_err(|error| format!("create avatar dir {} failed: {error}", avatar_dir.display()))?;

    let mut command = Command::new(&binary_path);
    command
        .env("APP_ENV", "desktop")
        .env("APP_NAME", "rust-adminYH")
        .env("APP_HTTP__HOST", "127.0.0.1")
        .env("APP_HTTP__PORT", ADMIN_API_PORT)
        .env("APP_LOGGING__JSON_LOGS", "true")
        .env("APP_STORAGE__AVATAR_DIR", avatar_dir)
        .env("DATABASE_MIGRATE_ON_START", "false")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| format!("spawn {} failed: {error}", binary_path.display()))?;
    let child_id = child.id();
    state.push_diagnostic(format!(
        "admin-api sidecar spawned pid={child_id} path={}",
        binary_path.display()
    ));

    if let Some(stdout) = child.stdout.take() {
        drain_sidecar_pipe(Arc::clone(&state), "stdout", stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        drain_sidecar_pipe(Arc::clone(&state), "stderr", stderr);
    }

    *state.child.lock().expect("sidecar child lock poisoned") = Some(child);
    Ok(())
}

fn resolve_admin_api_binary<R: tauri::Runtime>(app: &tauri::App<R>) -> Result<PathBuf, String> {
    if let Ok(path) = env::var("ADMIN_YH_DESKTOP_ADMIN_API_BIN") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!(
            "ADMIN_YH_DESKTOP_ADMIN_API_BIN does not point to a file: {}",
            path.display()
        ));
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resolve resource dir failed: {error}"))?;
    let binary_name = platform_binary_name();
    let candidates = [
        resource_dir.join("binaries").join(&binary_name),
        resource_dir.join(&binary_name),
    ];

    candidates.into_iter().find(|path| path.is_file()).ok_or_else(|| {
        format!("admin-api sidecar binary not found; expected {binary_name} in bundled resources")
    })
}

fn platform_binary_name() -> String {
    #[cfg(windows)]
    {
        format!("{ADMIN_API_BIN_NAME}.exe")
    }
    #[cfg(not(windows))]
    {
        ADMIN_API_BIN_NAME.to_owned()
    }
}

fn drain_sidecar_pipe<R: std::io::Read + Send + 'static>(
    state: Arc<SidecarState>,
    stream_name: &'static str,
    stream: R,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            match line {
                Ok(line) => state.push_diagnostic(format!("admin-api {stream_name}: {line}")),
                Err(error) => {
                    state.push_diagnostic(format!(
                        "admin-api {stream_name} read failed: {error}"
                    ));
                    break;
                }
            }
        }
    });
}

fn is_health_available() -> bool {
    std::net::TcpStream::connect_timeout(
        &"127.0.0.1:16824"
            .parse()
            .expect("valid loopback socket address"),
        std::time::Duration::from_millis(250),
    )
    .is_ok()
}

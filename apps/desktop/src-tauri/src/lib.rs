use std::{
    env,
    io::{BufRead, BufReader, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use tauri::{Manager, RunEvent};

const ADMIN_API_BIN_NAME: &str = "admin-api";
const ADMIN_API_HOST: &str = "127.0.0.1";
const ADMIN_API_PORT: &str = "16824";
const ADMIN_API_HEALTH_URL: &str = "http://127.0.0.1:16824/api/health";
const ADMIN_API_HEALTH_PATH: &str = "/api/health";
const HEALTH_PROBE_TIMEOUT_MS: u64 = 250;
const HEALTH_WAIT_TIMEOUT_MS: u64 = 10_000;
const HEALTH_WAIT_INTERVAL_MS: u64 = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SidecarPreflight {
    Disabled,
    AlreadyRunning,
    SpawnRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SidecarStartOutcome {
    Disabled,
    AlreadyRunning,
    Spawned,
}

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
                Ok(outcome) => state.push_diagnostic(format!(
                    "admin-api sidecar supervisor outcome={outcome:?}; health={ADMIN_API_HEALTH_URL}"
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
) -> Result<SidecarStartOutcome, String> {
    let disable_sidecar = env::var("ADMIN_YH_DESKTOP_DISABLE_SIDECAR").ok();
    match sidecar_preflight(disable_sidecar.as_deref(), is_admin_api_health_available) {
        SidecarPreflight::Disabled => {
            state.push_diagnostic(
                "admin-api sidecar disabled by ADMIN_YH_DESKTOP_DISABLE_SIDECAR=true",
            );
            return Ok(SidecarStartOutcome::Disabled);
        }
        SidecarPreflight::AlreadyRunning => {
            state.push_diagnostic(format!(
                "admin-api already healthy on {ADMIN_API_HEALTH_URL}; sidecar spawn skipped"
            ));
            return Ok(SidecarStartOutcome::AlreadyRunning);
        }
        SidecarPreflight::SpawnRequired => {}
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

    if let Err(error) = wait_for_admin_api_health() {
        state.push_diagnostic(format!("admin-api sidecar health check failed: {error}"));
        state.stop();
        return Err(error);
    }

    state.push_diagnostic(format!(
        "admin-api sidecar health check passed: {ADMIN_API_HEALTH_URL}"
    ));
    Ok(SidecarStartOutcome::Spawned)
}

fn resolve_admin_api_binary<R: tauri::Runtime>(app: &tauri::App<R>) -> Result<PathBuf, String> {
    let override_path = env::var("ADMIN_YH_DESKTOP_ADMIN_API_BIN").ok();
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resolve resource dir failed: {error}"))?;

    resolve_admin_api_binary_from(override_path.as_deref(), &resource_dir)
}

fn resolve_admin_api_binary_from(
    override_path: Option<&str>,
    resource_dir: &Path,
) -> Result<PathBuf, String> {
    if let Some(path) = override_path {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!(
            "ADMIN_YH_DESKTOP_ADMIN_API_BIN does not point to a file: {}",
            path.display()
        ));
    }

    let binary_name = platform_binary_name();
    let candidates = [
        resource_dir.join("binaries").join(&binary_name),
        resource_dir.join(&binary_name),
    ];

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            format!(
                "admin-api sidecar binary not found; expected {binary_name} in bundled resources"
            )
        })
}

fn sidecar_preflight(
    disable_sidecar: Option<&str>,
    health_probe: impl FnOnce() -> bool,
) -> SidecarPreflight {
    if disable_sidecar == Some("true") {
        return SidecarPreflight::Disabled;
    }

    if health_probe() {
        SidecarPreflight::AlreadyRunning
    } else {
        SidecarPreflight::SpawnRequired
    }
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
                    state.push_diagnostic(format!("admin-api {stream_name} read failed: {error}"));
                    break;
                }
            }
        }
    });
}

fn is_admin_api_health_available() -> bool {
    probe_admin_api_health(
        admin_api_socket_addr(),
        ADMIN_API_HEALTH_PATH,
        Duration::from_millis(HEALTH_PROBE_TIMEOUT_MS),
    )
}

fn wait_for_admin_api_health() -> Result<(), String> {
    wait_for_admin_api_health_at(
        admin_api_socket_addr(),
        ADMIN_API_HEALTH_PATH,
        ADMIN_API_HEALTH_URL,
        Duration::from_millis(HEALTH_WAIT_TIMEOUT_MS),
        Duration::from_millis(HEALTH_WAIT_INTERVAL_MS),
    )
}

fn wait_for_admin_api_health_at(
    address: SocketAddr,
    health_path: &str,
    health_url: &str,
    timeout: Duration,
    interval: Duration,
) -> Result<(), String> {
    let started = Instant::now();

    loop {
        if probe_admin_api_health(
            address,
            health_path,
            Duration::from_millis(HEALTH_PROBE_TIMEOUT_MS),
        ) {
            return Ok(());
        }

        if started.elapsed() >= timeout {
            return Err(format!(
                "admin-api sidecar health check timed out after {}ms: {health_url}",
                timeout.as_millis()
            ));
        }

        thread::sleep(interval.min(timeout.saturating_sub(started.elapsed())));
    }
}

fn probe_admin_api_health(address: SocketAddr, health_path: &str, timeout: Duration) -> bool {
    let mut stream = match TcpStream::connect_timeout(&address, timeout) {
        Ok(stream) => stream,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));

    let request = format!(
        "GET {health_path} HTTP/1.1\r\nHost: {ADMIN_API_HOST}:{ADMIN_API_PORT}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut status_line = String::new();
    let mut reader = BufReader::new(stream);
    if reader.read_line(&mut status_line).is_err() {
        return false;
    }

    status_line.starts_with("HTTP/1.1 200") || status_line.starts_with("HTTP/1.0 200")
}

fn admin_api_socket_addr() -> SocketAddr {
    format!("{ADMIN_API_HOST}:{ADMIN_API_PORT}")
        .parse()
        .expect("valid loopback socket address")
}

#[cfg(test)]
mod tests {
    use super::{
        probe_admin_api_health, resolve_admin_api_binary_from, sidecar_preflight,
        wait_for_admin_api_health_at, SidecarPreflight, ADMIN_API_HEALTH_PATH,
    };
    use std::{
        fs,
        io::{Read, Write},
        net::{SocketAddr, TcpListener},
        path::PathBuf,
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        },
        thread,
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn sidecar_preflight_skips_spawn_when_disable_env_is_true() {
        let probe_called = Arc::new(AtomicBool::new(false));
        let probe_called_in_closure = Arc::clone(&probe_called);

        let preflight = sidecar_preflight(Some("true"), || {
            probe_called_in_closure.store(true, Ordering::SeqCst);
            true
        });

        assert_eq!(preflight, SidecarPreflight::Disabled);
        assert!(!probe_called.load(Ordering::SeqCst));
    }

    #[test]
    fn sidecar_preflight_skips_spawn_when_health_is_available() {
        let preflight = sidecar_preflight(None, || true);

        assert_eq!(preflight, SidecarPreflight::AlreadyRunning);
    }

    #[test]
    fn sidecar_preflight_requires_spawn_when_not_disabled_and_unhealthy() {
        let preflight = sidecar_preflight(None, || false);

        assert_eq!(preflight, SidecarPreflight::SpawnRequired);
    }

    #[test]
    fn missing_sidecar_binary_returns_diagnostic_error() {
        let missing_resource_dir = unique_temp_path("missing-resource-dir");

        let error = resolve_admin_api_binary_from(None, &missing_resource_dir)
            .expect_err("missing bundled sidecar should be diagnostic");

        assert!(error.contains("admin-api sidecar binary not found"));
        assert!(error.contains("bundled resources"));
    }

    #[test]
    fn invalid_override_binary_returns_diagnostic_error() {
        let missing_binary = unique_temp_path("missing-admin-api");
        let resource_dir = unique_temp_path("resource-dir");

        let error = resolve_admin_api_binary_from(
            Some(missing_binary.to_str().expect("temp path should be UTF-8")),
            &resource_dir,
        )
        .expect_err("invalid override should be diagnostic");

        assert!(error.contains("ADMIN_YH_DESKTOP_ADMIN_API_BIN"));
        assert!(error.contains("does not point to a file"));
    }

    #[test]
    fn override_binary_path_is_used_when_it_exists() {
        let binary_path = unique_temp_path("admin-api");
        fs::write(&binary_path, b"test sidecar").expect("write temp sidecar");

        let resolved = resolve_admin_api_binary_from(
            Some(binary_path.to_str().expect("temp path should be UTF-8")),
            &unique_temp_path("resource-dir"),
        )
        .expect("existing override should resolve");

        assert_eq!(resolved, binary_path);
        let _ = fs::remove_file(resolved);
    }

    #[test]
    fn health_probe_requires_http_200_from_health_path() {
        let address = spawn_one_shot_health_server("HTTP/1.1 500 Internal Server Error");

        assert!(!probe_admin_api_health(
            address,
            ADMIN_API_HEALTH_PATH,
            Duration::from_secs(1)
        ));
    }

    #[test]
    fn wait_for_admin_api_health_succeeds_when_endpoint_returns_200() {
        let address = spawn_one_shot_health_server("HTTP/1.1 200 OK");

        wait_for_admin_api_health_at(
            address,
            ADMIN_API_HEALTH_PATH,
            "http://127.0.0.1:0/api/health",
            Duration::from_secs(2),
            Duration::from_millis(10),
        )
        .expect("health wait should pass once the sidecar answers /api/health");
    }

    fn spawn_one_shot_health_server(status_line: &'static str) -> SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let address = listener.local_addr().expect("read test listener address");

        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept health probe");
            let mut request = [0; 1024];
            let _ = stream.read(&mut request);
            let response =
                format!("{status_line}\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK");
            stream
                .write_all(response.as_bytes())
                .expect("write health response");
        });

        address
    }

    fn unique_temp_path(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be valid")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "rust-adminyh-tauri-test-{}-{nonce}-{name}",
            std::process::id()
        ))
    }
}

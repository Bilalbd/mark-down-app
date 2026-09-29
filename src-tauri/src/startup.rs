//! Startup watchdog: a launch always ends in a visible window, a relaunched copy, or the error box.
//!
//! WebView2 can wait forever for a browser process that never came up (wry blocks in
//! `GetMessage` until the creation callback fires, and nothing fires it), so a thread watches the
//! clock instead. When it fires it relaunches, or shows the error box, and then ends the process
//! with `TerminateProcess`: `std::process::exit` runs DLL detach code that needs the loader lock,
//! which the stuck main thread can be holding.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::commands::{self, PendingOpens};

const IDENTIFIER: &str = "com.bilal.markdown-viewer";
const WATCHDOG_DELAY: Duration = Duration::from_secs(15);
/// How long the watchdog waits for the relaunch to start before it gives up on it.
const RELAUNCH_WAIT: Duration = Duration::from_secs(3);
/// How long the watchdog waits for the log line to be written.
const LOG_WAIT: Duration = Duration::from_secs(2);
/// The log is cut back to its newest half when it grows past this.
const LOG_MAX_BYTES: usize = 64 * 1024;

/// The points of a launch the watchdog reports on, in the order they normally happen.
#[derive(Clone, Copy)]
pub enum Stage {
    /// `run()` was entered.
    Started,
    /// The Tauri builder is about to run.
    BuilderRun,
    /// The webview exists (Tauri's plugin hook; never reached when WebView2 creation hangs).
    WebviewCreated,
    /// `.setup()` began.
    SetupStart,
    /// `.setup()` finished.
    SetupDone,
    /// The page is running: it called the first Rust command. With `SetupDone`, this is what
    /// stops the watchdog; a page that never runs (its browser died) is a stuck start too.
    FrontendStarted,
    /// The frontend reported that it painted its first frame.
    AppReady,
}

const STAGE_NAMES: [&str; 7] = [
    "started",
    "builder-run",
    "webview-created",
    "setup-start",
    "setup-done",
    "frontend-started",
    "app-ready",
];

/// Milliseconds since `init()` plus one for each reached stage; 0 means not reached.
static STAGE_MS: [AtomicU64; 7] = [const { AtomicU64::new(0) }; 7];
static START: OnceLock<Instant> = OnceLock::new();

/// Starts the clock the stage times are measured from and marks `Stage::Started`.
pub fn init() {
    let _ = START.set(Instant::now());
    mark(Stage::Started);
}

/// Records that `stage` was reached (the first time only).
pub fn mark(stage: Stage) {
    let ms = START.get().map_or(0, |s| s.elapsed().as_millis() as u64);
    let _ =
        STAGE_MS[stage as usize].compare_exchange(0, ms + 1, Ordering::Relaxed, Ordering::Relaxed);
}

/// Whether `stage` has been reached.
pub fn reached(stage: Stage) -> bool {
    STAGE_MS[stage as usize].load(Ordering::Relaxed) != 0
}

/// Whether a launch that has (or hasn't) reached these stages by the deadline is stuck.
fn is_stuck(setup_done: bool, frontend_started: bool) -> bool {
    !(setup_done && frontend_started)
}

/// Every stage with the milliseconds after start it was reached at, or `None`.
fn stage_snapshot() -> Vec<(&'static str, Option<u64>)> {
    STAGE_NAMES
        .iter()
        .zip(STAGE_MS.iter())
        .map(|(name, ms)| {
            let v = ms.load(Ordering::Relaxed);
            (*name, if v == 0 { None } else { Some(v - 1) })
        })
        .collect()
}

/// One watchdog event, as it is written to `startup.log`.
pub struct LogEntry {
    pub unix_secs: u64,
    pub pid: u32,
    pub args: Vec<String>,
    pub stages: Vec<(&'static str, Option<u64>)>,
    pub outcome: String,
}

/// Formats Unix seconds as `YYYY-MM-DDTHH:MM:SSZ` (UTC), without a date library.
pub fn format_utc(unix_secs: u64) -> String {
    let days = (unix_secs / 86_400) as i64;
    let rem = unix_secs % 86_400;
    // Civil-from-days (Howard Hinnant's algorithm), days counted from 1970-01-01.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

/// One log line (no trailing newline): time, PID, arguments, stages and what the watchdog did.
pub fn format_log_line(entry: &LogEntry) -> String {
    let stages = entry
        .stages
        .iter()
        .map(|(name, ms)| match ms {
            Some(ms) => format!("{name}=+{ms}ms"),
            None => format!("{name}=not-reached"),
        })
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "{} pid={} args={:?} stages=[{}] {}",
        format_utc(entry.unix_secs),
        entry.pid,
        entry.args,
        stages,
        entry.outcome
    )
}

/// Keeps the newest lines of `text` when it is longer than `max` bytes: drops the older half,
/// starting the result at a line boundary.
pub fn cap_log(text: String, max: usize) -> String {
    if text.len() <= max {
        return text;
    }
    let mut cut = text.len() - max / 2;
    while !text.is_char_boundary(cut) {
        cut += 1;
    }
    match text[cut..].find('\n') {
        Some(i) => text[cut + i + 1..].to_string(),
        None => String::new(),
    }
}

/// `%LOCALAPPDATA%\com.bilal.markdown-viewer\startup.log`, the folder Tauri already uses.
fn log_path() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA")?;
    Some(Path::new(&base).join(IDENTIFIER).join("startup.log"))
}

/// Appends `line` to the log at `path`, keeping it under `max` bytes.
fn append_log(path: &Path, line: &str, max: usize) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut text = std::fs::read_to_string(path).unwrap_or_default();
    text.push_str(line);
    text.push('\n');
    std::fs::write(path, cap_log(text, max))
}

/// Runs `f` on its own thread and waits at most `wait` for the result.
fn run_with_timeout<T: Send + 'static>(
    wait: Duration,
    f: impl FnOnce() -> T + Send + 'static,
) -> Option<T> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(f());
    });
    rx.recv_timeout(wait).ok()
}

/// The relaunch's arguments: `relaunch_args` plus one `--open <path>` per file forwarded to this
/// stuck process (skipping repeats and the file already on the command line), so the new copy
/// opens them. `None` when this already is the relaunched copy.
pub fn relaunch_command_args(args: &[String], forwarded: &[String]) -> Option<Vec<String>> {
    let mut new_args = crate::relaunch_args(args)?;
    let launch_file = commands::launch_path(args, &std::env::current_dir().unwrap_or_default());
    let mut handed_over: Vec<&String> = Vec::new();
    for path in forwarded {
        if Some(path) != launch_file.as_ref() && !handed_over.contains(&path) {
            handed_over.push(path);
            new_args.push(commands::OPEN_FLAG.to_string());
            new_args.push(path.clone());
        }
    }
    Some(new_args)
}

/// Starts `exe` with `args` and returns the new process's ID.
fn spawn_relaunch(exe: PathBuf, args: Vec<String>) -> Result<u32, String> {
    std::process::Command::new(exe)
        .args(args)
        .spawn()
        .map(|child| child.id())
        .map_err(|e| e.to_string())
}

/// What the relaunch did, for the log.
fn describe_relaunch(result: Option<Result<u32, String>>, args: &[String]) -> String {
    match result {
        Some(Ok(pid)) => format!("relaunch=started pid={pid} args={args:?}"),
        Some(Err(e)) => format!("relaunch=failed error={e:?}"),
        None => format!("relaunch=timed-out after {}s", RELAUNCH_WAIT.as_secs()),
    }
}

/// Ends the process now. `TerminateProcess` skips `atexit` handlers and DLL detach, which is
/// wanted here: the process is stuck before setup finished, so it holds no document, and a normal
/// exit can wait forever on a lock the stuck thread owns.
fn terminate(code: u32) -> ! {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, TerminateProcess};
        let _ = TerminateProcess(GetCurrentProcess(), code);
    }
    // Reached off Windows, or if TerminateProcess itself failed.
    std::process::exit(code as i32)
}

fn write_log(outcome: String, args: &[String]) {
    let entry = LogEntry {
        unix_secs: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        pid: std::process::id(),
        args: args.to_vec(),
        stages: stage_snapshot(),
        outcome,
    };
    let line = format_log_line(&entry);
    if let Some(path) = log_path() {
        // A logging failure (or a stuck disk) must never stop the recovery, so the result is
        // ignored and the write gets its own thread with a time limit.
        let _ = run_with_timeout(LOG_WAIT, move || append_log(&path, &line, LOG_MAX_BYTES));
    }
}

/// Starts the watchdog thread. If setup hasn't finished, or the page hasn't started, after 15 s it
/// relaunches once, handing over the files waiting in `pending` (or, if this already is the
/// relaunched copy, shows the error box), and ends the process.
pub fn spawn_watchdog(args: Vec<String>, pending: PendingOpens) {
    std::thread::spawn(move || {
        std::thread::sleep(WATCHDOG_DELAY);
        if !is_stuck(reached(Stage::SetupDone), reached(Stage::FrontendStarted)) {
            return;
        }
        // try_lock: never wait on a lock the stuck process might hold.
        let forwarded = pending.0.try_lock().map(|p| p.clone()).unwrap_or_default();
        match relaunch_command_args(&args, &forwarded) {
            None => {
                write_log(
                    "relaunch=none (already relaunched); showing the error box".into(),
                    &args,
                );
                crate::show_startup_error();
                terminate(1);
            }
            Some(new_args) => {
                let result = match std::env::current_exe() {
                    Ok(exe) => {
                        // The spawn runs on a helper thread so a blocked CreateProcess can't stop us.
                        let spawn_args = new_args.clone();
                        run_with_timeout(RELAUNCH_WAIT, move || spawn_relaunch(exe, spawn_args))
                    }
                    Err(e) => Some(Err(e.to_string())),
                };
                let outcome = describe_relaunch(result, &new_args);
                write_log(outcome, &args);
                terminate(1);
            }
        }
    });
}

/// Whether `MDV_TEST_STALL_STARTUP` (`first` or `all`) asks this launch to stall.
#[cfg(debug_assertions)]
fn stall_requested(mode: Option<&str>, relaunched: bool) -> bool {
    match mode {
        Some("first") => !relaunched,
        Some("all") => true,
        _ => false,
    }
}

/// Debug builds only: imitates the real hang for testing. Stalls inside `.setup()` (the plugins
/// are initialised and the window exists) while still answering window messages, like the real
/// stuck process, until the watchdog ends the process.
#[cfg(debug_assertions)]
pub fn stall_if_requested(args: &[String]) {
    let mode = std::env::var("MDV_TEST_STALL_STARTUP").ok();
    let relaunched = args.iter().any(|a| a == "--relaunched");
    if !stall_requested(mode.as_deref(), relaunched) {
        return;
    }
    #[cfg(windows)]
    loop {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE,
        };
        // SAFETY: MSG is plain data; PeekMessageW fills it before it is read.
        let mut msg: MSG = unsafe { std::mem::zeroed() };
        while unsafe { PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) } != 0 {
            unsafe {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    #[cfg(not(windows))]
    loop {
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_utc_timestamps() {
        assert_eq!(format_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(format_utc(951_782_400), "2000-02-29T00:00:00Z"); // leap day
        assert_eq!(format_utc(1_790_000_000), "2026-09-21T14:13:20Z");
    }

    #[test]
    fn log_line_has_time_pid_args_stages_and_outcome() {
        let entry = LogEntry {
            unix_secs: 0,
            pid: 4242,
            args: vec![
                "C:\\a b\\markdown.exe".into(),
                "C:\\docs\\my file.md".into(),
            ],
            stages: vec![("started", Some(0)), ("setup-done", None)],
            outcome: "relaunch=started pid=7".into(),
        };
        let line = format_log_line(&entry);
        assert_eq!(
            line,
            "1970-01-01T00:00:00Z pid=4242 args=[\"C:\\\\a b\\\\markdown.exe\", \"C:\\\\docs\\\\my file.md\"] \
             stages=[started=+0ms setup-done=not-reached] relaunch=started pid=7"
        );
        assert!(!line.contains('\n'));
    }

    #[test]
    fn cap_log_leaves_a_small_log_alone() {
        assert_eq!(cap_log("a\nb\n".to_string(), 100), "a\nb\n");
    }

    #[test]
    fn cap_log_drops_the_older_half_at_a_line_boundary() {
        let text: String = (0..100).map(|i| format!("line{i:03}\n")).collect(); // 800 bytes
        let capped = cap_log(text, 400);
        assert!(capped.len() <= 200);
        assert!(capped.starts_with("line"));
        assert!(capped.ends_with("line099\n"));
        assert!(!capped.contains("line000"));
        assert_eq!(capped.lines().count(), capped.matches('\n').count());
    }

    #[test]
    fn cap_log_does_not_split_a_multibyte_character() {
        let text = "é".repeat(200) + "\nlast\n";
        let capped = cap_log(text, 100);
        assert_eq!(capped, "last\n");
    }

    #[test]
    fn append_log_adds_lines_and_stays_under_the_cap() {
        let dir = std::env::temp_dir().join(format!("mdv-startup-test-{}", std::process::id()));
        let path = dir.join("startup.log");
        for i in 0..50 {
            append_log(&path, &format!("entry {i:03} {}", "x".repeat(20)), 400).unwrap();
        }
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.len() <= 400);
        assert!(text.contains("entry 049"));
        assert!(!text.contains("entry 000"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn run_with_timeout_returns_a_fast_result_and_gives_up_on_a_slow_one() {
        assert_eq!(run_with_timeout(Duration::from_secs(2), || 5), Some(5));
        let slow = run_with_timeout(Duration::from_millis(50), || {
            std::thread::sleep(Duration::from_millis(500));
            5
        });
        assert_eq!(slow, None);
    }

    #[test]
    fn a_launch_is_stuck_unless_setup_finished_and_the_page_started() {
        assert!(!is_stuck(true, true));
        assert!(is_stuck(false, false));
        assert!(is_stuck(true, false)); // the browser died after setup: no page ever runs
        assert!(is_stuck(false, true));
    }

    #[test]
    fn describes_each_relaunch_result() {
        let args = vec!["--relaunched".to_string()];
        assert!(describe_relaunch(Some(Ok(12)), &args).starts_with("relaunch=started pid=12"));
        assert!(
            describe_relaunch(Some(Err("boom".into())), &args).contains("failed error=\"boom\"")
        );
        assert!(describe_relaunch(None, &args).starts_with("relaunch=timed-out"));
    }

    fn strings(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn relaunch_hands_over_forwarded_files_as_open_arguments() {
        let args = strings(&["exe", "C:\\a.md"]);
        let forwarded = strings(&["C:\\my docs\\b.md", "C:\\c.md"]);
        assert_eq!(
            relaunch_command_args(&args, &forwarded),
            Some(strings(&[
                "C:\\a.md",
                "--new-window",
                "--relaunched",
                "--open",
                "C:\\my docs\\b.md",
                "--open",
                "C:\\c.md"
            ]))
        );
    }

    #[test]
    fn relaunch_without_forwarded_files_matches_relaunch_args() {
        let args = strings(&["exe", "--new-window", "C:\\a.md"]);
        assert_eq!(
            relaunch_command_args(&args, &[]),
            crate::relaunch_args(&args)
        );
        assert_eq!(
            relaunch_command_args(&strings(&["exe"]), &[]),
            Some(strings(&["--new-window", "--relaunched"]))
        );
    }

    #[test]
    fn relaunch_skips_repeated_files_and_the_launch_file() {
        let args = strings(&["exe", "C:\\a.md"]);
        let forwarded = strings(&["C:\\a.md", "C:\\b.md", "C:\\b.md"]);
        assert_eq!(
            relaunch_command_args(&args, &forwarded),
            Some(strings(&[
                "C:\\a.md",
                "--new-window",
                "--relaunched",
                "--open",
                "C:\\b.md"
            ]))
        );
    }

    #[test]
    fn an_already_relaunched_copy_hands_nothing_over() {
        let args = strings(&["exe", "--new-window", "--relaunched"]);
        assert_eq!(relaunch_command_args(&args, &strings(&["C:\\b.md"])), None);
    }

    #[test]
    fn handed_over_files_survive_a_round_trip_through_the_command_line() {
        let forwarded = strings(&["C:\\my docs\\b.md", "C:\\c.md"]);
        let new_args = relaunch_command_args(&strings(&["exe"]), &forwarded).unwrap();
        let mut argv = vec!["exe".to_string()];
        argv.extend(new_args);
        assert_eq!(commands::opens_from_args(&argv), forwarded);
        assert_eq!(commands::launch_path(&argv, Path::new("C:\\home")), None);
    }

    #[test]
    fn marks_stages_once_and_reports_them() {
        init();
        assert!(reached(Stage::Started));
        let snapshot = stage_snapshot();
        assert_eq!(snapshot.len(), STAGE_NAMES.len());
        assert_eq!(snapshot[0].0, "started");
        assert!(snapshot[0].1.is_some());
    }

    #[cfg(debug_assertions)]
    #[test]
    fn stall_modes() {
        assert!(stall_requested(Some("first"), false));
        assert!(!stall_requested(Some("first"), true));
        assert!(stall_requested(Some("all"), true));
        assert!(!stall_requested(Some("nonsense"), false));
        assert!(!stall_requested(None, false));
    }
}

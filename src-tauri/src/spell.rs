//! Spell checking via the Windows Spell Checking API (`ISpellCheckerFactory` /
//! `ISpellChecker`), so the app costs nothing extra in the installer and supports every
//! language Windows has a dictionary for.
//!
//! All COM objects live on one dedicated worker thread, started lazily on first use and kept
//! for the app's lifetime: it calls `CoInitializeEx` once, creates the factory lazily, and
//! caches one `ISpellChecker` per language tag so repeated requests skip the dictionary-load
//! cost. Commands send a request over an `mpsc` channel and block on the reply inside
//! `spawn_blocking`, so neither the UI thread nor the async runtime ever blocks on COM.

use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::{mpsc, Arc, Mutex};

use windows::core::{HSTRING, PWSTR};
use windows::Win32::Globalization::{
    ISpellChecker, ISpellCheckerFactory, ISpellingError, SpellCheckerFactory,
    CORRECTIVE_ACTION_DELETE, CORRECTIVE_ACTION_GET_SUGGESTIONS, CORRECTIVE_ACTION_REPLACE,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IEnumString,
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};

/// Reject a `spell_check` call whose texts add up to more than this many UTF-16 code units.
/// The frontend only ever sends the visible part of a document, so a request this large
/// would be a bug rather than a legitimate use.
const MAX_UTF16_UNITS: usize = 500_000;

/// At most this many suggestions are returned from `spell_suggest`.
const MAX_SUGGESTIONS: usize = 8;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SpellErrorKind {
    Misspelled,
    Repeated,
    Autocorrect,
}

/// One misspelling, in UTF-16 code units - which match JavaScript string indices, so the
/// frontend can use them unchanged.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SpellError {
    pub start: u32,
    pub length: u32,
    pub kind: SpellErrorKind,
}

/// Intersects each language's errors for one text by (start, length): a range is kept only if
/// every language reported it. One language is returned unchanged (sorted); zero languages
/// yields nothing.
pub fn merge_errors(per_language: &[Vec<SpellError>]) -> Vec<SpellError> {
    let Some((first, rest)) = per_language.split_first() else {
        return Vec::new();
    };
    let mut result = first.clone();
    for other in rest {
        result.retain(|e| other.iter().any(|o| o.start == e.start && o.length == e.length));
    }
    result.sort_by_key(|e| e.start);
    result
}

/// Interleaves suggestion lists (1st of each, then 2nd of each, ...), de-duplicating while
/// keeping each word's first position, and caps the result at `max`.
pub fn interleave_suggestions(per_language: &[Vec<String>], max: usize) -> Vec<String> {
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    let longest = per_language.iter().map(Vec::len).max().unwrap_or(0);
    for i in 0..longest {
        for language in per_language {
            let Some(word) = language.get(i) else { continue };
            if result.len() >= max {
                return result;
            }
            if seen.insert(word.clone()) {
                result.push(word.clone());
            }
        }
    }
    result
}

/// One request to the spell-check worker thread; each carries a channel to reply on.
enum SpellRequest {
    Languages(mpsc::Sender<Result<Vec<String>, String>>),
    Check {
        texts: Vec<String>,
        languages: Vec<String>,
        reply: mpsc::Sender<Result<Vec<Vec<SpellError>>, String>>,
    },
    Suggest {
        word: String,
        languages: Vec<String>,
        reply: mpsc::Sender<Result<Vec<String>, String>>,
    },
}

/// Managed state holding the channel to the worker thread, started lazily on first use.
#[derive(Default)]
pub struct SpellState(Arc<Mutex<Option<mpsc::Sender<SpellRequest>>>>);

/// Returns the worker's request channel, starting the worker thread on first call.
fn ensure_worker(state: &SpellState) -> Result<mpsc::Sender<SpellRequest>, String> {
    let mut guard = state.0.lock().map_err(|_| "spell worker lock poisoned".to_string())?;
    if let Some(sender) = &*guard {
        return Ok(sender.clone());
    }
    let (tx, rx) = mpsc::channel();
    std::thread::Builder::new()
        .name("spell-worker".to_string())
        .spawn(move || worker_loop(rx))
        .map_err(|e| e.to_string())?;
    *guard = Some(tx.clone());
    Ok(tx)
}

/// The worker thread's body: one COM apartment for the app's lifetime.
fn worker_loop(rx: mpsc::Receiver<SpellRequest>) {
    // SAFETY: called once, before any COM object is created on this thread, and never
    // paired with an early CoUninitialize - this thread's only COM calls are below.
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }

    let mut factory: Option<ISpellCheckerFactory> = None;
    let mut checkers: HashMap<String, ISpellChecker> = HashMap::new();

    while let Ok(request) = rx.recv() {
        match request {
            SpellRequest::Languages(reply) => {
                let _ = reply.send(get_languages(&mut factory));
            }
            SpellRequest::Check { texts, languages, reply } => {
                let _ = reply.send(do_check(&mut factory, &mut checkers, &texts, &languages));
            }
            SpellRequest::Suggest { word, languages, reply } => {
                let _ = reply.send(do_suggest(&mut factory, &mut checkers, &word, &languages));
            }
        }
    }

    // SAFETY: pairs with the CoInitializeEx above; the loop only exits once every sender
    // (and so every in-flight command) has been dropped, so no COM call can follow this.
    unsafe {
        CoUninitialize();
    }
}

/// Creates the spell-checker factory on first use and reuses it afterwards.
fn ensure_factory(factory: &mut Option<ISpellCheckerFactory>) -> Result<ISpellCheckerFactory, String> {
    if let Some(existing) = factory {
        return Ok(existing.clone());
    }
    let created: ISpellCheckerFactory =
        unsafe { CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER) }
            .map_err(|e| e.to_string())?;
    *factory = Some(created.clone());
    Ok(created)
}

/// Drains a COM string enumerator into owned Rust strings, freeing each string Windows
/// allocated for us.
fn collect_enum_string(enumerator: &IEnumString) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    loop {
        let mut buf = [PWSTR::null()];
        let mut fetched = 0u32;
        let hr = unsafe { enumerator.Next(&mut buf, Some(&mut fetched)) };
        if fetched == 0 {
            hr.ok().map_err(|e| e.to_string())?;
            break;
        }
        let s = unsafe { buf[0].to_string() }.map_err(|e| e.to_string())?;
        unsafe { CoTaskMemFree(Some(buf[0].as_ptr() as *const _)) };
        out.push(s);
    }
    Ok(out)
}

/// Every BCP-47 language tag Windows has a dictionary for, sorted.
fn get_languages(factory: &mut Option<ISpellCheckerFactory>) -> Result<Vec<String>, String> {
    let factory = ensure_factory(factory)?;
    let enum_langs = unsafe { factory.SupportedLanguages() }.map_err(|e| e.to_string())?;
    let mut langs = collect_enum_string(&enum_langs)?;
    langs.sort();
    Ok(langs)
}

/// Returns the cached (or newly created) checker for `language`, or `None` if Windows has no
/// dictionary for it - callers skip unsupported tags rather than failing.
fn get_checker(
    factory: &mut Option<ISpellCheckerFactory>,
    checkers: &mut HashMap<String, ISpellChecker>,
    language: &str,
) -> Result<Option<ISpellChecker>, String> {
    if let Some(checker) = checkers.get(language) {
        return Ok(Some(checker.clone()));
    }
    let factory = ensure_factory(factory)?;
    let tag = HSTRING::from(language);
    let supported = unsafe { factory.IsSupported(&tag) }.map_err(|e| e.to_string())?;
    if !supported.as_bool() {
        return Ok(None);
    }
    let checker = unsafe { factory.CreateSpellChecker(&tag) }.map_err(|e| e.to_string())?;
    checkers.insert(language.to_string(), checker.clone());
    Ok(Some(checker))
}

/// Runs one language's checker over `text`. `CORRECTIVE_ACTION_NONE` results are dropped.
fn check_text(checker: &ISpellChecker, text: &HSTRING) -> Result<Vec<SpellError>, String> {
    let enum_errors = unsafe { checker.Check(text) }.map_err(|e| e.to_string())?;
    let mut errors = Vec::new();
    loop {
        let mut item: Option<ISpellingError> = None;
        let hr = unsafe { enum_errors.Next(&mut item) };
        let Some(spelling_error) = item else {
            hr.ok().map_err(|e| e.to_string())?;
            break;
        };
        let start = unsafe { spelling_error.StartIndex() }.map_err(|e| e.to_string())?;
        let length = unsafe { spelling_error.Length() }.map_err(|e| e.to_string())?;
        let action = unsafe { spelling_error.CorrectiveAction() }.map_err(|e| e.to_string())?;
        let kind = match action {
            CORRECTIVE_ACTION_GET_SUGGESTIONS => Some(SpellErrorKind::Misspelled),
            CORRECTIVE_ACTION_DELETE => Some(SpellErrorKind::Repeated),
            CORRECTIVE_ACTION_REPLACE => Some(SpellErrorKind::Autocorrect),
            _ => None,
        };
        if let Some(kind) = kind {
            errors.push(SpellError { start, length, kind });
        }
    }
    Ok(errors)
}

/// Checks every text against every supported requested language, keeping a range only when
/// all of them agree it's wrong (see `merge_errors`).
fn do_check(
    factory: &mut Option<ISpellCheckerFactory>,
    checkers: &mut HashMap<String, ISpellChecker>,
    texts: &[String],
    languages: &[String],
) -> Result<Vec<Vec<SpellError>>, String> {
    let mut supported = Vec::new();
    for language in languages {
        if let Some(checker) = get_checker(factory, checkers, language)? {
            supported.push(checker);
        }
    }
    texts
        .iter()
        .map(|text| {
            let wide = HSTRING::from(text.as_str());
            let per_language = supported
                .iter()
                .map(|checker| check_text(checker, &wide))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(merge_errors(&per_language))
        })
        .collect()
}

/// Suggestions for `word` from every supported language that rejects it, interleaved,
/// de-duplicated and capped (see `interleave_suggestions`). A language that accepts the word
/// contributes nothing.
fn do_suggest(
    factory: &mut Option<ISpellCheckerFactory>,
    checkers: &mut HashMap<String, ISpellChecker>,
    word: &str,
    languages: &[String],
) -> Result<Vec<String>, String> {
    let wide = HSTRING::from(word);
    let mut per_language = Vec::new();
    for language in languages {
        let Some(checker) = get_checker(factory, checkers, language)? else {
            continue;
        };
        if check_text(&checker, &wide)?.is_empty() {
            continue;
        }
        let enum_suggestions = unsafe { checker.Suggest(&wide) }.map_err(|e| e.to_string())?;
        per_language.push(collect_enum_string(&enum_suggestions)?);
    }
    Ok(interleave_suggestions(&per_language, MAX_SUGGESTIONS))
}

/// Windows' installed spelling dictionaries, as BCP-47 language tags (sorted).
#[tauri::command]
pub async fn spell_languages(state: tauri::State<'_, SpellState>) -> Result<Vec<String>, String> {
    let sender = ensure_worker(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (reply, rx) = mpsc::channel();
        sender
            .send(SpellRequest::Languages(reply))
            .map_err(|_| "spell-check worker is not running".to_string())?;
        rx.recv().map_err(|_| "spell-check worker is not running".to_string())?
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Checks each of `texts` against every ticked, installed language: a range is only reported
/// if *every* supported language rejects it, so mixed-language notes work.
#[tauri::command]
pub async fn spell_check(
    state: tauri::State<'_, SpellState>,
    texts: Vec<String>,
    languages: Vec<String>,
) -> Result<Vec<Vec<SpellError>>, String> {
    let total_units: usize = texts.iter().map(|t| t.encode_utf16().count()).sum();
    if total_units > MAX_UTF16_UNITS {
        return Err(format!(
            "spell_check: {total_units} UTF-16 units exceeds the {MAX_UTF16_UNITS}-unit limit"
        ));
    }
    let sender = ensure_worker(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (reply, rx) = mpsc::channel();
        sender
            .send(SpellRequest::Check { texts, languages, reply })
            .map_err(|_| "spell-check worker is not running".to_string())?;
        rx.recv().map_err(|_| "spell-check worker is not running".to_string())?
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Suggestions for `word` from every supported language that rejects it (see `do_suggest`).
#[tauri::command]
pub async fn spell_suggest(
    state: tauri::State<'_, SpellState>,
    word: String,
    languages: Vec<String>,
) -> Result<Vec<String>, String> {
    let sender = ensure_worker(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (reply, rx) = mpsc::channel();
        sender
            .send(SpellRequest::Suggest { word, languages, reply })
            .map_err(|_| "spell-check worker is not running".to_string())?;
        rx.recv().map_err(|_| "spell-check worker is not running".to_string())?
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod merge_errors_tests {
    use super::*;

    fn err(start: u32, length: u32, kind: SpellErrorKind) -> SpellError {
        SpellError { start, length, kind }
    }

    #[test]
    fn zero_languages_yields_nothing() {
        assert_eq!(merge_errors(&[]), Vec::new());
    }

    #[test]
    fn one_language_is_unchanged_but_sorted() {
        let a = vec![
            err(5, 2, SpellErrorKind::Misspelled),
            err(0, 3, SpellErrorKind::Repeated),
        ];
        assert_eq!(
            merge_errors(&[a]),
            vec![err(0, 3, SpellErrorKind::Repeated), err(5, 2, SpellErrorKind::Misspelled)]
        );
    }

    #[test]
    fn keeps_only_ranges_every_language_reports() {
        let a = vec![err(0, 3, SpellErrorKind::Misspelled), err(9, 4, SpellErrorKind::Misspelled)];
        let b = vec![err(9, 4, SpellErrorKind::Misspelled), err(20, 1, SpellErrorKind::Misspelled)];
        assert_eq!(merge_errors(&[a, b]), vec![err(9, 4, SpellErrorKind::Misspelled)]);
    }

    #[test]
    fn no_agreement_yields_nothing() {
        let a = vec![err(0, 3, SpellErrorKind::Misspelled)];
        let b = vec![err(9, 4, SpellErrorKind::Misspelled)];
        assert_eq!(merge_errors(&[a, b]), Vec::new());
    }

    #[test]
    fn keeps_the_reported_kind_from_the_agreeing_ranges() {
        let a = vec![err(0, 3, SpellErrorKind::Repeated)];
        let b = vec![err(0, 3, SpellErrorKind::Repeated)];
        assert_eq!(merge_errors(&[a, b]), vec![err(0, 3, SpellErrorKind::Repeated)]);
    }
}

#[cfg(test)]
mod interleave_suggestions_tests {
    use super::*;

    fn words(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn interleaves_in_round_robin_order() {
        let en = words(&["test", "tests", "toast"]);
        let ar = words(&["tent", "text"]);
        assert_eq!(
            interleave_suggestions(&[en, ar], 8),
            words(&["test", "tent", "tests", "text", "toast"])
        );
    }

    #[test]
    fn deduplicates_keeping_first_position() {
        let a = words(&["test", "toast"]);
        let b = words(&["test", "tent"]);
        assert_eq!(interleave_suggestions(&[a, b], 8), words(&["test", "toast", "tent"]));
    }

    #[test]
    fn caps_at_max() {
        let a = words(&["a", "b", "c"]);
        assert_eq!(interleave_suggestions(&[a], 2), words(&["a", "b"]));
    }

    #[test]
    fn empty_input_yields_nothing() {
        assert_eq!(interleave_suggestions(&[], 8), Vec::<String>::new());
    }
}

#[cfg(test)]
mod windows_integration_tests {
    use super::*;

    /// Exercises the real Windows Spell Checking API. Only skips the actual assertions on a
    /// machine with no English dictionary installed, since that's outside this project's
    /// control; a `get_languages` failure is a real failure (the API is present on every
    /// supported Windows version), not something to skip past silently.
    #[cfg(windows)]
    #[test]
    fn flags_known_typos_and_suggests_a_fix_in_english() {
        // SAFETY: called once, before any COM object is created on this thread. The test
        // harness runs each test on a plain thread with no COM apartment of its own, so
        // CoCreateInstance below needs one initialised here (unlike the real worker thread,
        // which is set up once in `worker_loop`). Paired with CoUninitialize at the end, after
        // every COM object created below has been dropped (they're scoped to the block below).
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }

        {
            let mut factory: Option<ISpellCheckerFactory> = None;
            let languages = get_languages(&mut factory)
                .expect("the Spell Checking API is present on every supported Windows version");

            if languages.iter().any(|l| l.eq_ignore_ascii_case("en-US")) {
                let mut checkers = HashMap::new();
                let en = vec!["en-US".to_string()];

                let results =
                    do_check(&mut factory, &mut checkers, &["Ths is a tset".to_string()], &en)
                        .expect("spell_check should succeed once en-US is confirmed supported");
                let errors = &results[0];
                assert!(errors.iter().any(|e| e.start == 0 && e.length == 3), "{errors:?}");
                assert!(errors.iter().any(|e| e.start == 9 && e.length == 4), "{errors:?}");

                let suggestions = do_suggest(&mut factory, &mut checkers, "tset", &en)
                    .expect("spell_suggest should succeed once en-US is confirmed supported");
                assert!(
                    suggestions.iter().any(|s| s.eq_ignore_ascii_case("test")),
                    "{suggestions:?}"
                );
            }
            // else: this machine has no English dictionary installed - nothing to check here.
            // `factory` and `checkers` are dropped at the end of this block, before
            // CoUninitialize runs below.
        }

        // SAFETY: pairs with the CoInitializeEx above; every COM object created in this test
        // was scoped to the block above and has already been dropped.
        unsafe {
            CoUninitialize();
        }
    }
}

# Phase 1: Windows spell-check engine

Add three Tauri commands that use the Windows Spell Checking API, plus their typed wrappers in
`src/lib/tauri.ts`. Nothing is visible yet; Phase 2 adds the squiggles and settings.

## Design

- **API:** `ISpellCheckerFactory` (created with `CoCreateInstance(&SpellCheckerFactory, …)`),
  `ISpellChecker` per language tag, `ISpellChecker::Check` → `IEnumSpellingError`
  (`StartIndex`, `Length`, `CorrectiveAction`), `ISpellChecker::Suggest` → `IEnumString`,
  `ISpellCheckerFactory::SupportedLanguages` → `IEnumString`. Offsets are **UTF-16 code units**,
  which match JavaScript string indices, so pass them through unchanged.
- **Crate:** add `windows = { version = "0.61", features = ["Win32_Foundation",
  "Win32_Globalization", "Win32_System_Com"] }` under the existing
  `[target.'cfg(windows)'.dependencies]`. Use **0.61** because `webview2-com` already brings
  `windows 0.61.3` into `Cargo.lock`, so nothing new is compiled; confirm with `cargo tree -i
  windows` that there's still only one `windows` version. Add more features only if the
  compiler asks for them. The commit message says why the dependency is there.
- **Threading:** COM objects live on **one dedicated worker thread** that calls
  `CoInitializeEx(None, COINIT_MULTITHREADED)` once, creates the factory lazily, and caches one
  `ISpellChecker` per language tag. Commands send a request over a `std::sync::mpsc` channel and
  wait for the reply. The commands are `async fn` and do the blocking send/receive inside
  `tauri::async_runtime::spawn_blocking`, so neither the UI thread nor the async runtime blocks.
  Hold the sender in managed state (`app.manage(...)`), starting the thread on first use.
- **Multiple languages** (Bilal's decision): a range is an error only if **every** requested
  language that is supported reports an error with the same start and length. Unsupported tags
  are skipped silently. No supported language → no errors.
- **Suggestions:** from each supported language that rejects the word, interleaved (1st of each,
  then 2nd of each, …), de-duplicated, at most 8.
- **Limits:** reject a `spell_check` call whose texts add up to more than 500,000 UTF-16 units with
  an `Err` (the frontend only sends the visible part of a document). Never `unwrap()`/`expect()`
  on COM results; map every `windows::core::Error` to `String`.

## Commands

```rust
#[derive(Serialize)] #[serde(rename_all = "camelCase")]
pub struct SpellError { pub start: u32, pub length: u32, pub kind: SpellErrorKind }
// kind: "misspelled" (GET_SUGGESTIONS), "repeated" (DELETE), "autocorrect" (REPLACE)

async fn spell_languages() -> Result<Vec<String>, String>                 // BCP-47 tags, sorted
async fn spell_check(texts: Vec<String>, languages: Vec<String>)
    -> Result<Vec<Vec<SpellError>>, String>                               // one list per text
async fn spell_suggest(word: String, languages: Vec<String>) -> Result<Vec<String>, String>
```

`CORRECTIVE_ACTION_NONE` results are dropped.

## Files

- `src-tauri/src/spell.rs` (new): worker, commands, pure helpers and tests.
- `src-tauri/src/lib.rs`: `mod spell;`, the three commands in `generate_handler!`, managed state.
- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`.
- `src/lib/tauri.ts`: wrappers.
- `src-tauri/capabilities/default.json`: **no change expected.** The app's own commands are
  allowed today without entries (no app manifest in `build.rs`). Confirm the commands work from
  the dev app; if they're refused, stop and report instead of widening permissions.

## Tasks

- [x] **1.** Pure helpers in `spell.rs`, each with `#[cfg(test)]` tests:
  `merge_errors(per_language: &[Vec<SpellError>]) -> Vec<SpellError>` (intersection by
  start+length; one language → unchanged; zero languages → empty; order by start) and
  `interleave_suggestions(per_language: &[Vec<String>], max: usize) -> Vec<String>` (interleave,
  de-duplicate keeping first position, cap).
- [x] **2.** The worker thread and the three commands, as designed above.
- [x] **3.** A Windows-only integration test (`#[cfg(windows)]`) that, if `en-US` is supported,
  checks `"Ths is a tset"` → errors at (0,3) and (9,4), and that `spell_suggest("tset")` includes
  `"test"`. If `en-US` isn't supported, the test returns early with a comment explaining why (it
  mustn't fail on a PC without English).
- [x] **4.** `src/lib/tauri.ts`: `export interface SpellError { start: number; length: number;
  kind: 'misspelled' | 'repeated' | 'autocorrect' }`, `spellLanguages(): Promise<string[]>`,
  `spellCheck(texts: string[], languages: string[]): Promise<SpellError[][]>`,
  `spellSuggest(word: string, languages: string[]): Promise<string[]>`. Each is safe without Tauri
  (`isTauri()` false → `[]`, or one empty list per text). JSDoc on each. Callers handle rejection
  (Phase 2), so the wrappers don't swallow errors.
- [x] **5.** Short unit tests for the wrappers' non-Tauri fallbacks in the existing test file for
  `tauri.ts` if there is one, otherwise `src/lib/tauri.test.ts`.

## Verify

- [x] `cargo check`, `cargo test`, `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [x] In the dev app (CDP, `window.__TAURI_INTERNALS__.invoke`):
  - `spell_languages` lists what Windows has; on this PC expect at least `en-US` and `ar-SA`.
  - `spell_check(["Ths is a tset"], ["en-US"])` → two errors at the right offsets.
  - An Arabic sentence with one misspelled word, checked with `["ar-SA"]` → that word flagged; the
    same sentence without the mistake → nothing.
  - `spell_check(["hello مرحبا"], ["en-US", "ar-SA"])` → no errors (each word is known to one
    language); with `["en-US"]` only → the Arabic word is flagged.
  - Timing: a 10,000-word English text (e.g. a slice of `fixtures/huge.md`), first call and a
    repeat call. Report both times.
- [x] Commit: `Add a Windows spell-check engine`.

## Report

**What was built.** `src-tauri/src/spell.rs` (new) implements the three commands with the
one-worker-thread design from this document, using the `windows` crate directly against
`ISpellCheckerFactory` / `ISpellChecker` (`Win32::Globalization`) and `IEnumString` /
`CoCreateInstance` / `CoInitializeEx` (`Win32::System::Com`). The worker thread calls
`CoInitializeEx(None, COINIT_MULTITHREADED)` once, creates the factory lazily, and caches one
`ISpellChecker` per language tag in a `HashMap`. Commands are `async fn`s that call
`ensure_worker` (starts the thread on first use, behind `SpellState`'s `Mutex`) and then do the
actual `mpsc` send/receive inside `tauri::async_runtime::spawn_blocking`. `spell_check` rejects
combined texts over 500,000 UTF-16 units before touching the worker. Every `windows::core::Error`
and `HRESULT` is mapped to `String` (via `.map_err(|e| e.to_string())` / `hr.ok().map_err(...)`);
there is no `unwrap()`/`expect()` on any COM result. `merge_errors` and `interleave_suggestions`
are pure functions with their own `#[cfg(test)]` unit tests. `do_suggest` only takes suggestions
from a language whose checker actually rejects the word (`check_text(...).is_empty()` skip),
matching "from each supported language that rejects the word".

`src-tauri/src/lib.rs`: added `mod spell;`, `.manage(spell::SpellState::default())`, and the three
commands in `generate_handler!`. `src-tauri/Cargo.toml`: added `windows = { version = "0.61",
features = ["Win32_Foundation", "Win32_Globalization", "Win32_System_Com"] }` under
`[target.'cfg(windows)'.dependencies]`, with a comment saying it adds no new crate to compile
(confirmed below). `src-tauri/capabilities/default.json`: **no change** - the three commands work
from the dev app with the existing `core:default` permission, as the document predicted.

`src/lib/tauri.ts`: added the `SpellError` interface and the three wrappers
(`spellLanguages`/`spellCheck`/`spellSuggest`), each safe outside Tauri (`[]`, or one `[]` per
text). `src/lib/tauri.test.ts` (new, no prior file existed for `tauri.ts`): four tests for the
non-Tauri fallbacks.

**Nothing else was touched.** No UI, no settings keys, no README changes - this phase adds no
visible feature (Phase 2 does), so the README's shortcut/setting tables don't apply yet.

**Verify - commands:**
- `cargo check` (from `src-tauri`, cargo on `PATH`): clean, no warnings.
- `cargo tree -i windows`: single `windows v0.61.3`, already pulled in by `tao` / `tauri` /
  `webview2-com` / `wry` - confirms no new crate was compiled.
- `cargo test`: **54 passed; 0 failed** (up from the crate's prior count - `spell::*` added 10:
  5 `merge_errors` tests, 4 `interleave_suggestions` tests, and the one Windows integration test,
  which ran for real on this PC since `en-US` is installed - see below).
- `pnpm test`: **495 passed** (up from the documented baseline of **491** - the 4 new
  `tauri.test.ts` tests).
- `pnpm lint`: clean.
- `npx tsc --noEmit`: clean.
- `pnpm format`: no files needed reformatting.

**Verify - dev app (CDP).** Launched `pnpm tauri dev` with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
= --remote-debugging-port=9222` and an isolated `WEBVIEW2_USER_DATA_FOLDER` under this agent's
scratchpad (no installed copy of the app was running at the time - confirmed with `tasklist`
first - so the single-instance lock was never a risk; `--new-window` was tried but the pnpm/tauri
CLI's `--`-forwarding to `cargo run` mis-ordered the flag ahead of cargo's own trailing `--` and
cargo rejected it, so it was dropped and the app was launched plainly instead). `settings.json`,
`presets.json` and `.window-state.json` were backed up first and diffed byte-identical against
the live files afterwards, so nothing needed restoring. The app's own process (PID 6748) was
stopped by that exact PID once done.

- `spell_languages` → 20 tags including `en-US` and `ar-SA` (Arabic variants, `en-CA`, `en-LR`,
  `en-PH` too).
- `spell_check(["Ths is a tset"], ["en-US"])` →
  `[[{"start":0,"length":3,"kind":"misspelled"},{"start":9,"length":4,"kind":"misspelled"}]]` -
  exactly the documented offsets.
- Arabic: `"مرحبا بكمم في هذا التطبيق"` (one letter added to the second word) checked with
  `["ar-SA"]` → `[{"start":6,"length":4,"kind":"misspelled"}]`; the same sentence spelled
  correctly (`"مرحبا بكم في هذا التطبيق"`) → `[]`.
- `spell_check(["hello مرحبا"], ["en-US", "ar-SA"])` → `[]` (each word known to one language);
  the same text with `["en-US"]` only → `[{"start":6,"length":5,"kind":"misspelled"}]` (the
  Arabic word).
- `spell_suggest("tset", ["en-US"])` → `["test", "stet", "set"]` - includes `"test"`.
- Timing, a 1000-line / 10,324-word slice of `fixtures/huge.md` (64,836 UTF-16 units, well under
  the 500,000 limit): **first call 278 ms**, **repeat call 270 ms**. (The two calls are close
  because the cost is dominated by `ISpellChecker::Check` walking the text each time, not by
  factory/checker creation, which is already cached after the very first request of any kind.)
  3,030 ranges were flagged - expected, since `huge.md`'s body text is repeated Latin
  ("Lorem ipsum dolor sit amet...") which isn't in an English dictionary.

**Differences from the phase document / notes for the supervisor:**
- `--new-window` could not be passed through `pnpm tauri dev --` cleanly (see above); since no
  other instance of the app was running, launching without it was safe and is noted here rather
  than left silent.
- Everything else matches the design as written; no permission widening, no extra dependencies
  beyond the one named `windows` crate.

**Review fix.** The supervisor pointed out that `flags_known_typos_and_suggests_a_fix_in_english`
ran on the test-harness thread without ever calling `CoInitializeEx`, and that treating a
`get_languages` error as "skip" meant `CO_E_NOTINITIALIZED` on an uninitialised thread could make
the test silently pass without checking anything. Fixed: the test now calls
`CoInitializeEx(None, COINIT_MULTITHREADED)` itself at the start (with a SAFETY comment explaining
why - the test thread has no COM apartment of its own, unlike the real worker thread) and
`CoUninitialize` at the end, with the `factory`/`checkers`/results scoped to an inner block so
every COM object is dropped before `CoUninitialize` runs. `get_languages` failing is now a real
`.expect()` failure, not a skip; only "no `en-US` dictionary on this machine" still skips the
assertions (via an `if`, not an early `return`, so `CoUninitialize` still runs either way).

Proved the test can actually fail: changed the first assertion's expected start from `0` to `1`
and ran `cargo test flags_known -- --nocapture`:
```
thread 'spell::windows_integration_tests::flags_known_typos_and_suggests_a_fix_in_english' (20988) panicked at src\spell.rs:468:17:
[SpellError { start: 0, length: 3, kind: Misspelled }, SpellError { start: 9, length: 4, kind: Misspelled }]
test spell::windows_integration_tests::flags_known_typos_and_suggests_a_fix_in_english ... FAILED
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 53 filtered out; finished in 0.24s
```
Reverted the change and re-ran the same command:
```
test spell::windows_integration_tests::flags_known_typos_and_suggests_a_fix_in_english ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 53 filtered out; finished in 0.26s
```
Re-ran the full suites afterwards: `cargo check` clean; `cargo test` **54 passed, 0 failed**;
`pnpm test` **495 passed** (unchanged - this fix only touches Rust). No dev-app check was needed
or done for this fix, per the supervisor's instruction.

## Supervisor check

Built by a Sonnet 5 agent. Diff reviewed against this document: worker thread, lazy factory,
per-language checker cache, intersection merge, interleaved suggestions, size limit, no
`unwrap()` on COM results, `windows 0.61.3` only (`cargo tree -i windows@0.61.3`), no capability
changes. One review round: the integration test didn't initialise COM and treated a
`get_languages` failure as "skip", so it could pass without checking anything; fixed in
`81e3edc` (the agent showed it failing with a broken assertion, then passing).

Re-run by the supervisor: `cargo test` 54 passed, `pnpm test` 495 passed, lint and tsc clean.

In-app check by the supervisor (debug exe launched directly with `--new-window`, its own
`WEBVIEW2_USER_DATA_FOLDER` and remote debugging; Vite started separately): 20 languages including
`en-US` and `ar-SA`; `Ths is a tset` → (0,3) and (9,4); `the the cat` → `repeated` at (4,3);
a correct Arabic sentence → none, the same sentence with one misspelled word → (9,6);
`hello مرحبا` → none with `en-US` + `ar-SA`, the Arabic word (6,5) with `en-US` only; an
unknown tag or no languages → none; `spell_suggest("tset")` → `test, stet, set`, and a correct
word → none; 500,001 units → refused with the limit message. A screen-sized batch (60 lines, two
languages) took 38 ms. Settings files byte-identical afterwards.

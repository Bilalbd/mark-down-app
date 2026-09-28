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

- [ ] **1.** Pure helpers in `spell.rs`, each with `#[cfg(test)]` tests:
  `merge_errors(per_language: &[Vec<SpellError>]) -> Vec<SpellError>` (intersection by
  start+length; one language → unchanged; zero languages → empty; order by start) and
  `interleave_suggestions(per_language: &[Vec<String>], max: usize) -> Vec<String>` (interleave,
  de-duplicate keeping first position, cap).
- [ ] **2.** The worker thread and the three commands, as designed above.
- [ ] **3.** A Windows-only integration test (`#[cfg(windows)]`) that, if `en-US` is supported,
  checks `"Ths is a tset"` → errors at (0,3) and (9,4), and that `spell_suggest("tset")` includes
  `"test"`. If `en-US` isn't supported, the test returns early with a comment explaining why (it
  mustn't fail on a PC without English).
- [ ] **4.** `src/lib/tauri.ts`: `export interface SpellError { start: number; length: number;
  kind: 'misspelled' | 'repeated' | 'autocorrect' }`, `spellLanguages(): Promise<string[]>`,
  `spellCheck(texts: string[], languages: string[]): Promise<SpellError[][]>`,
  `spellSuggest(word: string, languages: string[]): Promise<string[]>`. Each is safe without Tauri
  (`isTauri()` false → `[]`, or one empty list per text). JSDoc on each. Callers handle rejection
  (Phase 2), so the wrappers don't swallow errors.
- [ ] **5.** Short unit tests for the wrappers' non-Tauri fallbacks in the existing test file for
  `tauri.ts` if there is one, otherwise `src/lib/tauri.test.ts`.

## Verify

- [ ] `cargo check`, `cargo test`, `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] In the dev app (CDP, `window.__TAURI_INTERNALS__.invoke`):
  - `spell_languages` lists what Windows has; on this PC expect at least `en-US` and `ar-SA`.
  - `spell_check(["Ths is a tset"], ["en-US"])` → two errors at the right offsets.
  - An Arabic sentence with one misspelled word, checked with `["ar-SA"]` → that word flagged; the
    same sentence without the mistake → nothing.
  - `spell_check(["hello مرحبا"], ["en-US", "ar-SA"])` → no errors (each word is known to one
    language); with `["en-US"]` only → the Arabic word is flagged.
  - Timing: a 10,000-word English text (e.g. a slice of `fixtures/huge.md`), first call and a
    repeat call. Report both times.
- [ ] Commit: `Add a Windows spell-check engine`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_

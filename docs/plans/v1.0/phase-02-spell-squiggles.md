# Phase 2: Squiggles in the editor and Spelling settings

Underline misspelled words with a red wavy line in the source editor (Source view and the editor
side of Split), using Phase 1's engine. Add a **Spelling** section to Settings → General.

## Behaviour

- **Where:** the CodeMirror source editor only. No squiggles in the formatted view.
- **What's checked:** prose only. Skip fenced and indented code, inline code, URLs and autolinks
  (including bare GFM autolinks), link and image destinations, reference definitions
  (`[x]: http…`), HTML tags and comments, maths (`$…$` and `$$…$$`, the same delimiters the
  renderer accepts), a YAML front matter block at the very top (`---` … `---`), and HEX colour
  codes (`#AA00BB`). Link text, image alt text, headings, table cells, list items and quotes *are*
  checked.
- **When:** after the user stops typing for 400 ms, and after scrolling (the visible lines plus 50
  lines above and below). Never on every keystroke. Existing squiggles are mapped through edits
  (`decorations.map(tr.changes)`) so they don't jump while the next check is pending.
- **The word being typed** (the word the cursor touches) isn't underlined until the cursor leaves
  it.
- **Cache:** results are cached per (languages, prose segment text), so scrolling back or retyping
  a line doesn't ask Rust again. Cap the cache (e.g. 5,000 entries; clear it when full). Clear it
  when the languages change. Responses from an older request (a sequence number) are dropped.
- **Personal dictionary and Ignore:** words in `spellWords` (settings) and in the window's ignore
  set (view store) are never underlined. Compare case-insensitively (`toLocaleLowerCase()`).
- **Failure:** if a `spellCheck` call rejects, show no squiggles for that pass and try again on the
  next change. Don't show an error (spell check is a hint, not a document operation). Write that
  reason in a comment.
- **Performance:** typing in `fixtures/huge.md` must feel the same with spell check on as off.

## Settings

Add to `Settings` and `DEFAULTS` in `src/store/settings.ts`:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `spellCheck` | `boolean` | `true` | Underline misspelled words in the source editor |
| `spellLanguages` | `string[]` | `[]` | Ticked languages; `[]` means "automatic" (see below) |
| `spellWords` | `string[]` | `[]` | Personal dictionary |

**Automatic languages** (`[]`): the supported tag that best matches `navigator.language` (exact
tag, else same primary language, e.g. `en-GB` → `en-US`), else `en-US` if supported, else the
first supported tag, else none.

Settings → General gets a **Spelling** section after the Editor section:

- **Check spelling**: toggle (`spellCheck`).
- **Languages**: one checkbox per tag from `spellLanguages()`, labelled with
  `new Intl.DisplayNames([navigator.language], { type: 'language' }).of(tag)` (e.g. "English
  (United States)"), sorted by label. With `spellLanguages` empty, the automatic languages show as
  ticked. The first change writes the explicit list. **The checkbox of the only ticked language is
  disabled**, so the list can never be emptied from the UI - `spellLanguages: []` always means
  "automatic" (Supervisor decision, Phase 2 review: this removes the `[]` ambiguity between
  "never touched" and "explicitly cleared"). A note under the list reads *"To stop checking, turn
  off Check spelling."* The whole checklist is also disabled while *Check spelling* is off.
- If Windows has no spelling languages (or Tauri isn't there): a hint instead of the list:
  *"Windows has no spelling dictionaries installed. Add a language in Windows Settings → Time &
  language → Language & region."*
- **Personal dictionary**: the words, each with a remove button (`aria-label="Remove <word>"`,
  lucide `X` with the shared icon props), or *"No words added yet."* A word is added from the
  right-click menu (Phase 4); for this phase, adding is tested through the store.

Reuse the existing Settings controls (`controls.tsx`) and CSS classes; add only what's missing.

## Files

- `src/lib/spell.ts` (new): pure helpers. `effectiveSpellLanguages(saved, supported, navLang)`,
  `languageLabel(tag, uiLang)`, `isKnownWord(word, spellWords, ignored)`, and the cache (a small
  class or closure, testable).
- `src/lib/proseRanges.ts` (new): `proseRanges(tree: Tree, doc: string, from: number, to: number):
  { from: number; to: number }[]`: the parts of `doc` in `[from, to)` that should be checked, from
  the `@lezer/markdown` tree (node names such as `FencedCode`, `CodeBlock`, `InlineCode`, `URL`,
  `Autolink`, `LinkReference`, `HTMLTag`, `HTMLBlock`, `Comment`) plus regex exclusions for maths,
  front matter and HEX codes (the parser doesn't know those). Check the exact node names against
  the parser rather than trusting this list.
- `src/components/Editor/spellcheck.ts` (new): the CodeMirror extension (a `ViewPlugin` that
  schedules checks and a `StateField` holding a `DecorationSet` of `Decoration.mark({ class:
  'cm-misspelled' })`), plus `misspellingAt(state, pos): { from: number; to: number; word: string }
  | null` for Phase 4. Wire only; the logic lives in the two `lib/` files.
- `src/components/Editor/SourceEditor.tsx`: add the extension through a `Compartment`, reconfigured
  when `spellCheck`, the effective languages or `spellWords` change (same pattern as the gutter
  compartment).
- Squiggle style: `text-decoration: underline wavy var(--spell-error)`, `text-decoration-skip-ink:
  none`, a small `text-underline-offset`. Put it where the editor's other styles live (read
  `editorTheme.ts` and `SourceEditor.css` first). New token `--spell-error` in
  `src/styles/app-theme.css` with **a light and a dark value** (a clear red that passes on both
  editor backgrounds).
- `src/store/settings.ts` (+ tests), `src/store/view.ts` (ignore set:
  `spellIgnored: ReadonlySet<string>`, `ignoreWord(word)`; never saved).
- `src/components/Settings/GeneralTab.tsx` (+ `GeneralTab.test.tsx`).
- `fixtures/spelling.md` (new): English prose with some mistakes; an Arabic paragraph with one
  mistake; a mixed English and Arabic line; and one example of each thing that must *not* be
  underlined (code block, inline code, bare URL, link with a misspelled label and a URL, image,
  reference definition, HTML tag, inline and block maths, front matter, a HEX code), each with a
  deliberately "misspelled" token inside.
- `README.md`: a Spell check bullet.

## Tasks

- [x] **1.** `proseRanges.ts` + tests: parse with `markdownLanguage.parser.parse(text)` (the same
  GFM parser the editor uses) and assert the ranges for each excluded construct and a few
  included ones (heading text, link label, table cell, list item).
- [x] **2.** `spell.ts` + tests: automatic language choice (exact, primary-language match,
  `en-US` fallback, none), labels, `isKnownWord` (case-insensitive, both sources), cache
  (hit, miss, cap, clear on language change).
- [x] **3.** Settings keys + tests (defaults, persistence like the other array keys).
- [x] **4.** The CodeMirror extension and its wiring in `SourceEditor.tsx`.
- [x] **5.** Spelling section in Settings, with tests (toggle, checklist from a mocked
  `spellLanguages`, automatic ticks, empty-list hint, removing a personal word).
- [x] **6.** `fixtures/spelling.md`, README bullet.

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`, `cargo check` (no Rust changes
  expected).
- [x] Dev app, a copy of `fixtures/spelling.md`, Source view, **light and dark** screenshots: the
  English and Arabic mistakes are underlined; nothing in the "must not" examples is; the mixed line
  is clean when both languages are ticked and the Arabic word is underlined with English only.
- [x] Split view: squiggles in the editor pane only.
- [x] Settings: toggle off removes all squiggles at once; toggling back restores them. Ticking and
  unticking languages updates the squiggles without reopening the file.
- [x] Add a word to `spellWords` through the store (`{ persist: false }`); its squiggles disappear
  in every open tab.
- [x] Typing: type a misspelled word; no squiggle while the cursor is on it; it appears after the
  cursor moves on and 400 ms pass.
- [x] `fixtures/huge.md` (copy): type 30 characters at the end and in the middle, and scroll from
  top to bottom, with spell check on and off. Report keystroke-to-paint timings (a
  `performance.now()` measurement around dispatch + `requestAnimationFrame`) and the number of
  `spell_check` calls made while scrolling.
- [x] Commit: `Underline misspelled words in the source editor`.

## Report

**What was built.**

- `src/lib/proseRanges.ts` (new): `proseRanges(tree, doc, from, to)` walks the real GFM syntax tree
  (`markdownLanguage.parser.parse`, the same parser `SourceEditor` uses) and subtracts the ranges
  of `FencedCode`, `CodeBlock`, `InlineCode`, `URL` (covers link/image destinations, reference
  definitions' destinations, and bare/explicit autolinks alike - confirmed by printing the real
  tree, not assumed), `Autolink`, `LinkReference`, `HTMLTag`, `HTMLBlock`, `Comment` and
  `CommentBlock`, plus three regexes for what the parser doesn't represent as nodes: a YAML front
  matter block at doc start, `$…$`/`$$…$$` maths (matching `@mdit/plugin-katex`'s `dollars`
  delimiters and `allowInlineWithSpace: false`), and 6-digit HEX colours. Also exports
  `splitRangesByLine`, which chops the result at line boundaries so the cache (below) hits reliably
  across overlapping scroll windows. 25 tests, including probing the actual parser's node names
  for every construct in the phase document plus a few of the "must stay checked" ones (heading
  text, table cells, list items, quotes, emphasis).
- `src/lib/spell.ts` (new): `effectiveSpellLanguages(saved, supported, navLang)` (exact tag → same
  primary language, preferring `en-US` among ties → `en-US` → first supported → none),
  `languageLabel(tag, uiLang)` (`Intl.DisplayNames`, falls back to the tag), `isKnownWord` (personal
  dictionary + ignore set, case-insensitive), and `SpellCache` (keyed on sorted languages + exact
  text, clears itself outright past 5,000 entries). 17 tests.
- `src/components/Editor/spellcheck.ts` (new): `spellcheckExtension(languages, spellWords)` -  a
  `StateField<DecorationSet>` (mapped through `tr.changes` so squiggles don't jump mid-edit) plus a
  `ViewPlugin` that debounces 400 ms after any doc change, viewport change or selection change,
  then checks the viewport ±50 lines. It runs once from the constructor too (not just `update`),
  since `EditorView.setState` recreates view plugins from scratch but never fires an `update`, so a
  freshly loaded/switched-to document is covered without waiting for an edit or scroll. Each check:
  builds per-line segments via `proseRanges` + `splitRangesByLine`, looks each up in the plugin's
  own `SpellCache`, sends every cache miss to `spellCheck` in **one batched IPC call**, then filters
  the combined (cached + fetched) results by the personal dictionary/ignore set and by the word
  currently touching the caret (computed fresh at filter time, so "isn't flagged until the cursor
  leaves it" falls out naturally rather than needing separate instant-reveal logic). A response
  whose request sequence number is stale is dropped; a rejected `spellCheck` call just skips that
  pass (comment explains why: spell check is a hint, not a document operation). `misspellingAt`
  reads the field for Phase 4.
- `src/components/Editor/SourceEditor.tsx`: a `spellCompartment`, computed by a shared
  `currentSpellExtension()` helper (off, or no effective language → `[]`; otherwise
  `spellcheckExtension(...)`). It's used for the *initial* per-mount/per-load extension (reading
  the store synchronously, so a freshly created editor state is never stale) **and** is
  unconditionally re-dispatched right after every `loadId` change (see "Bug found and fixed"
  below), in addition to the existing reactive `useEffect` on `[spellCheck, effective languages,
  spellWords]` that reconfigures the live, currently-mounted editor. Supported languages are
  fetched once (`spellLanguages()`) into a new `view` store field and combined with
  `settings.spellLanguages` via `effectiveSpellLanguages`.
- `src/components/Editor/editorTheme.ts`: `.cm-misspelled` rule (`text-decoration: underline wavy
  var(--spell-error)`, `text-decoration-skip-ink: none`, `text-underline-offset: 3px`).
- `src/styles/app-theme.css`: `--spell-error` token, `#c42b1c` (light) / `#ff6859` (dark) - a clear
  red confirmed legible on both editor backgrounds in the screenshots below.
- `src/store/settings.ts`: `spellCheck` (`true`), `spellLanguages` (`[]`), `spellWords` (`[]`),
  added to `Settings`/`DEFAULTS` (not `EPHEMERAL_KEYS`, so they persist). Tests for defaults, `set`,
  and disk persistence of the two array keys (mirroring the existing `recentFiles` pattern).
- `src/store/view.ts`: `spellSupportedLanguages: string[]` (+ setter) and `spellIgnored:
  ReadonlySet<string>` (+ `ignoreWord`, lower-cases on insert) - both transient, never saved.
- `src/components/Settings/GeneralTab.tsx`: a **Spelling** section after **Source editor** - a
  toggle, a sorted checklist of `spellLanguages()`'s result (ticked from `spellLanguages` once
  non-empty, else from `effectiveSpellLanguages([], …)`; the whole checklist disabled while the
  toggle is off; a hint paragraph when Windows has no dictionaries), and the personal dictionary as
  a list with an `aria-label="Remove <word>"` button using the shared Toolbar `ICON` props (as
  `TabStrip.tsx` already does). 10 tests (up from 1), covering the hint states, automatic vs.
  explicit ticking, the disabled state, writing the explicit list on first tick, and removing a
  word.
- `src/components/Settings/SettingsPanel.css`: `.settings__checklist` and `.settings__word-list`
  rules, following the existing token/BEM conventions.
- `fixtures/spelling.md` (new): front matter with a typo, an English paragraph with three typos, an
  Arabic paragraph with one deliberately-misspelled word, a mixed English/Arabic paragraph using a
  *correctly* spelled Arabic word (to exercise the intersection: flagged with English only, clean
  with both), and every excluded construct from the phase document, each hiding a `wiht` - fenced
  and inline code, a bare URL, an HTML tag (in an attribute, so the visible text next to it stays
  checked), inline and block maths, a HEX colour, and a reference definition - plus a link and an
  image whose *destination* is misspelled but whose label/alt text is also misspelled, to show
  the destination is skipped while the text isn't. Verified programmatically against the real
  `proseRanges` output before ever loading it in the app.
- `README.md`: one bullet under Features.

**Bug found and fixed during verification (not in the original diff).** The cross-tab check in the
phase document ("its squiggles disappear in every open tab") turned up a real gap: `SourceEditor`
caches each tab's whole `EditorState` (`lib/editorCache.ts`) so switching tabs is instant, and
`view.setState(restored)` puts that cached state back verbatim - compartment contents included.
If `spellWords` (or the languages, or the toggle) changed while a *different* tab was active, the
reactivated tab's `spellCompartment` still held whatever was live the last time *it* was active,
because the reactive `useEffect` that reconfigures it only fires when its own dependencies change,
not on a tab switch. Fixed by unconditionally re-dispatching
`spellCompartment.reconfigure(currentSpellExtension())` right after the `loadId` effect's
restore-or-create branch, in `src/components/Editor/SourceEditor.tsx`, so every tab switch
reconciles the compartment against the *current* settings regardless of what was cached. Verified
before and after (see the CDP transcript below) - reproduced with two tabs, `spellWords` changed
while tab 2 was active, then confirmed tab 1 still showed the stale squiggle before the fix and
didn't after. No test file covers `SourceEditor.tsx` directly (none existed before this phase
either - it's DOM/CodeMirror-heavy and the codebase verifies it live per CLAUDE.md), so this is
only guarded by the manual check below; flagging that as a possible gap rather than papering over
it with a shallow unit test that wouldn't exercise the real caching path.

**Differences from the phase document.**

- The supervisor's mid-task note applies: `@lezer/common`/`@lezer/markdown` are never imported
  directly. `proseRanges.ts` types its `tree` parameter as `ReturnType<typeof syntaxTree>` (`import
  type { syntaxTree } from '@codemirror/language'`), and `spellcheck.ts` uses `ensureSyntaxTree`/
  `syntaxTree` from the same package. `package.json` is unchanged - no new dependency.
- Caching granularity: the document says "cached per (languages, prose segment text)"; segments are
  chopped to **line** granularity (`splitRangesByLine`) before caching, because a "prose segment"
  from `proseRanges` over a shifting `viewport ± 50 lines` window doesn't have stable boundaries
  between two scroll positions, while a line's boundaries are stable - this is what actually makes
  "scrolling back... doesn't ask Rust again" true in practice (confirmed by the call count below).
- `spellLanguages: []` doubles as both "automatic" and "the user explicitly wants zero languages"
  in the settings schema as specified (3 keys, no 4th). Unticking the sole automatically-ticked
  language *is* allowed (Verified: `GeneralTab.test.tsx`'s "writes the explicit list..." test, and
  it produces no squiggles for the rest of that session), but since the schema can't distinguish
  "never touched" from "explicitly cleared," restarting the app (or a fresh `refreshAll()`, e.g. on
  window focus - see below) will re-derive an automatic pick from the same `[]` on disk. This only
  matters for the specific sequence "untick the only automatically-ticked box as your very first
  interaction"; ticking any language explicitly (the far more common path) makes the array
  non-empty and unambiguous from then on. Flagging this rather than adding an undocumented 4th
  settings key to work around it.
- Unrelated existing behaviour that affected *testing*, not the feature: `App.tsx` refreshes
  settings from disk on window focus (`refreshAll()`), which silently reset in-memory
  `{ persist: false }` test values (e.g. `spellLanguages`) between separate CDP calls whenever the
  WebView2 window's focus changed. Worked around by doing multi-step checks in one script instead
  of several, and by re-asserting the setting right before anything that depended on it.

**Verify.**

- `pnpm test`: **549 passed** (37 files), up from the documented **495** baseline after Phase 1
  (+54: 25 `proseRanges.test.ts`, 17 `spell.test.ts`, 9 `GeneralTab.test.tsx` (1 → 10), 2
  `settings.test.ts`, 1 `settings.persist.test.ts`). `pnpm lint`: clean. `npx tsc --noEmit`: clean.
  `pnpm format`: no files needed reformatting. `cargo check` / `cargo test`: clean, **54 passed**
  (unchanged - no Rust files touched).
- Dev app (debug exe launched directly with `--new-window`, its own `WEBVIEW2_USER_DATA_FOLDER`,
  remote debugging on 9222; Vite started separately), a copy of `fixtures/spelling.md`, Source
  view, both themes (screenshots opened and read, not just captured):
  - **Dark**: the front matter's `wiht` is clean; `sentance`/`mistaks`/`seccond` are underlined;
    the Arabic paragraph's `بكمم` is underlined and the rest isn't; the mixed line's two `مرحبا`
    are clean with English+Arabic both ticked. Squiggle colour is a clear red, distinct from the
    Shiki code-text colour.
  - **Light**: same document, same behaviour, `--spell-error: #c42b1c` clearly legible on the
    white editor background - confirmed genuinely different chrome (toolbar/background/theme
    icon), not a byte-identical screenshot.
  - Scrolled further: the fenced/inline code, bare URL, HTML tag's attribute, inline/block maths,
    HEX colour and reference definition (including its title) are all clean; the link's label
    (`linnk labl wiht mistaks`) and the image's alt text (`alt txt wiht mistak`) are underlined
    while their destinations aren't.
  - With only `en-US` ticked (the automatic pick on this PC, since `navigator.language` is
    `en-US`), the Arabic words are (correctly) all flagged, and two incidental British-spelling
    words in my own fixture prose (`maths`, `colour`) are flagged too - an expected false positive
    against the `en-US`-only dictionary, not a bug.
- Split view: squiggles appeared only in the source pane; the formatted pane (same content,
  rendered) had none.
- Settings: `spellCheck` off → 17 → 0 `.cm-misspelled` elements immediately; back on → 17 again.
  Setting `spellLanguages` from `[]` (automatic, `en-US` only) to `['en-US', 'ar-SA']` dropped the
  count from 17 to 11 (the three correctly-spelled Arabic words and the mixed line's two `مرحبا`
  no longer intersect) without reopening the file.
- `spellWords`: adding `['wiht', 'mistaks']` (`{ persist: false }`) dropped both from the flagged
  set; clearing it brought them back. **Cross-tab** (see "Bug found and fixed"): with two tabs open
  and `spellWords` changed while tab 2 was active, tab 1 - restored from its editor-state cache -
  now shows the update immediately on switching back, with no reopen.
- Typing: inserted `helllo` at the cursor and waited 900 ms with the caret still inside it - **no**
  squiggle. Moved the caret to the end of the line and waited another 900 ms - `helllo` **was**
  flagged. (`whileTyping`/`afterCursorMoved` arrays quoted in the session transcript; `helllo` is
  absent from the first and present in the second, everything else unchanged.)
- `fixtures/huge.md` (copy, 6,002 lines), spell check off vs. on (`en-US`), 30 characters typed at
  the end and in the middle, `performance.now()` around `dispatch` + the next
  `requestAnimationFrame`:

  | | off, end | off, middle | on, end | on, middle |
  |---|---|---|---|---|
  | avg ms/keystroke | 8.65 | 8.30 | 8.34 | 8.51 |
  | max ms | 23.7 | 14.8 | 15.6 | 16.0 |

  Essentially identical - the 400 ms debounce means no spell-check work ever runs synchronously on
  the typing path. Scrolling from top to bottom in 10 steps (plus the initial view), with spell
  check on: **13 `spell_check` IPC calls total** (confirmed by watching
  `Network.requestWillBeSent` over CDP for `http://ipc.localhost/spell_check`, since
  `window.__TAURI_INTERNALS__.invoke` itself isn't writable and can't be monkey-patched) - i.e.
  roughly one batched call per debounce window, not one per scroll event, and most of
  `huge.md`'s repeated "Lorem ipsum" text is genuinely unrecognised by any installed dictionary so
  nearly every visible word is flagged (expected, matches Phase 1's own timing note about this
  fixture).
- Settings files: `presets.json` and `.window-state.json` byte-identical to the pre-session backup
  throughout. `settings.json` differs from the backup only by the three new keys at their defaults
  and `recentFiles`, which was restored to `[]` after every session (via
  `clearRecentFiles()`) once the manual checks were done.
- Dev app and Vite processes were stopped by the exact PIDs this session started; no process was
  ever stopped by name or path pattern. One dev-exe launch (mid-session) hung during WebView2
  initialisation with no browser child process appearing for over 20 seconds - matching the
  known, unrelated "startup hang" Phase 8 is scheduled to fix (a Windows session
  Modern-Standby/idle-disconnect event was logged at the same time). It was killed by its exact
  PID and a retry succeeded normally; every subsequent launch in this session came up within a
  few seconds.

### Review fixes

Supervisor review of `87db9f5` asked for five fixes, addressed in `Fix spell-check refresh and
caching issues`:

1. **Stale replies after reconfigure.** `SpellCheckPlugin` now has a `destroyed` flag, set in
   `destroy()` (alongside clearing the pending timer and unsubscribing from the view store) and
   checked - alongside the existing sequence-number check - right after `await spellCheck(...)`
   returns and in `redecorate()` before every dispatch. Unit-tested in the new
   `src/components/Editor/spellcheck.test.ts`: a real `EditorView` with `spellcheckExtension`,
   a mocked `spellCheck` returning a controllable deferred promise, a `Compartment.reconfigure`
   that destroys the first plugin instance while its request is still in flight, and an assertion
   (via `misspellingAt`) that the destroyed instance's later-resolving reply never reaches the
   view, while the new instance's own reply still applies normally. A second test confirms
   resolving after the *view itself* (not just the compartment) is destroyed doesn't throw. Both
   pass; 2 new tests.
2. **Ignore doesn't refresh.** The fetch/cache/filter pipeline in `run()` is now split: `run()`
   stores the merged (pre-filter) results in `lastResolved` and calls a new `redecorate()` method,
   which applies the personal dictionary, the ignore set and the cursor-word exclusion and
   dispatches - entirely synchronously, no `spellCheck` call. The constructor now also subscribes
   to `useViewStore` and calls `redecorate()` whenever `spellIgnored` changes (unsubscribed in
   `destroy()`). Checked in the app: `ignoreWord('mistaks')` on `fixtures/spelling.md` (both
   occurrences) removed its squiggles in **7.9 ms** (measured with `performance.now()` around the
   call and two chained `requestAnimationFrame`s) - well under "one frame or so" - with the rest of
   the flagged words (`sentance`, `seccond`, `بكمم`, …) unaffected.
3. **Shared cache.** `SpellCache` is now instantiated once at module scope in `spellcheck.ts`
   (`sharedCache`), and every `SpellCheckPlugin` instance reads and writes it instead of holding
   its own - safe because the cache key already includes the (sorted) languages, so different
   language sets or different documents never collide, and a stale entry from a since-changed
   language set is simply never looked up again rather than needing explicit invalidation.
   Confirmed with the same `Network.requestWillBeSent`-over-CDP counting used for the huge.md
   scroll count, isolating each step with its own monitor window: opening a **brand-new**,
   never-before-seen tab (`tab4.md`) made **2** `spell_check` calls (the real, expected check);
   adding a personal-dictionary word while a *different*, already-checked tab was active made
   **0**; switching back to the first tab (content unchanged, previously checked with the same
   language) made **0**. (Two earlier isolated timing attempts with short, unsynchronised monitor
   windows returned false zeros for definitely-fresh content - a monitor-connection race, not a
   cache bug - resolved by using a longer window and confirming the monitor's `READY` line landed
   before triggering the action; the numbers above are from the corrected runs, cross-checked
   against the DOM's actual `.cm-misspelled` results.)
4. **The last language.** `GeneralTab.tsx`'s checklist now disables the checkbox of whichever
   language is the *only* one ticked (`tickedLanguages.size === 1 && tickedLanguages.has(tag)`),
   whether that's the automatic pick or an explicit single choice, and `toggleLanguage` itself
   guards the same case as a second line of defence. A note - *"To stop checking, turn off Check
   spelling."* - sits under the checklist whenever Windows has at least one dictionary. This
   resolves the `[]`-ambiguity flagged in the original Report (superseded by this fix):
   `spellLanguages: []` now always means "automatic," full stop, since the UI makes reaching an
   explicit-but-empty state impossible. The phase document's Settings section is updated to match.
   2 new tests (disabled-state + hint text; and that ticking a second language un-disables both).
5. **Cost on huge.md.** Measured `run()`'s synchronous portion (temporarily, with `performance.now()`
   around `ensureSyntaxTree`/`doc.toString()`/`proseRanges`/the cache-lookup loop, removed before
   committing) on the real running app with `fixtures/huge.md` (391,225 chars) open, across a
   top-to-bottom scroll and an edit: **0.6-2.0 ms total per run()** (`tree`: 0-0.1 ms, `toString`:
   0.1-0.3 ms, `proseRanges`: 0.4-1.5 ms, the rest: 0.1-0.2 ms), for windows of roughly
   5,800-10,600 characters. All comfortably under the ~10 ms threshold, so **no windowing change
   was made** - `proseRanges`' regex exclusions already run over the full document string in
   well under a millisecond in V8, even at this size (a standalone benchmark parsing and scanning
   the entire 391 KB file measured `proseRanges` alone at 1.47 ms, including the full-document
   maths/HEX/front-matter regexes - the dominant cost by far is the markdown *parse*, which the
   real `run()` doesn't pay for on every check since `ensureSyntaxTree` reuses CodeMirror's
   incremental tree). Numbers reported as asked either way; no code change needed for this one.

Re-ran after all five fixes: `pnpm test` **553 passed** (38 files, +4 over the 549 after
`87db9f5`: 2 in the new `spellcheck.test.ts`, 2 in `GeneralTab.test.tsx`). `pnpm lint`: clean.
`npx tsc --noEmit`: clean. `pnpm format`: no files needed changes. `cargo check`: clean (no Rust
touched). Settings files: `presets.json` and `.window-state.json` byte-identical to a fresh
pre-session backup; `settings.json` matches except `recentFiles`, restored to `[]` after the
session's manual checks.

### Settings layout fix

Supervisor's dark-theme, 20-language screenshot (16 of them Arabic variants) showed the
Languages control squeezed into a narrow column with wrapped two-line labels, the note beside
the list instead of under it, and the "Languages"/"Personal dictionary" row labels vertically
centred against their tall lists. Root cause: `GeneralTab.tsx` rendered the checklist and the
note as two siblings inside `<>...</>`, and `.settings__control` (their parent, from `Row` in
`controls.tsx`) is a row flexbox - so the two siblings sat side by side instead of stacking, and
centred against each other's height. Fixed entirely in `GeneralTab.tsx` (no `controls.tsx`
change) and `SettingsPanel.css`:

- Wrapped the checklist and the note in a single `<div className="settings__stack">` (flex
  column, full width) so `.settings__control` only ever sees one child there and they stack
  correctly, and the checklist gets the full control-column width instead of half a row.
- `.settings__row:has(.settings__checklist), .settings__row:has(.settings__word-list)` now sets
  `align-items: flex-start`, top-aligning the "Languages" and "Personal dictionary" labels with
  their lists (`:has()` is supported by the Edge/Chromium WebView2 runtime this app ships with,
  so no JS or extra prop on `Row` was needed).
- `.settings__checklist` gained `max-height: 264px` (~12 rows) with `overflow-y: auto` and a
  `border: 1px solid var(--chrome-border)` + `border-radius`, so 20+ languages scroll inside a
  bounded box instead of stretching Settings.
- `languageRows` now sorts ticked languages first (each group then by label, via a small
  comparator in the existing `useMemo`), so the languages in use are visible without scrolling.
  Removing the earlier attempt at forcing `white-space: nowrap` on the checklist labels: once the
  list has its full column width, normal short-label wrapping no longer happens in practice (see
  screenshots), and `nowrap` risked clipping the longest real labels (e.g. "Arabic (United Arab
  Emirates)") in the sidebar's fixed 380 px width - not worth it for a "no wrapping at normal
  widths" requirement.

New test in `GeneralTab.test.tsx`: ticks `fr-FR`/`zh-CN` among four languages and asserts the
rendered `<li data-tag>` order matches ticked-first-then-alphabetical, computed from the *actual*
`Intl.DisplayNames` labels (not hardcoded English strings) so it doesn't depend on a specific
ICU wording, with a sanity check that the assertion isn't vacuously satisfied.

Checked in the running app (debug exe, `--new-window`, this session's own WebView2 folder;
Vite separate) with 20 real Windows languages, 2 ticked (`en-US`, `ar-SA`) and 3 personal-
dictionary words, screenshots opened and read:

- **Dark, ~1114 px window**: `en-US` and `ar-SA` lead the list, both on one line each
  ("Arabic (Saudi Arabia)", "English (United States)"), followed by the rest alphabetically
  ("Arabic (Algeria)", "(Bahrain)", "(Egypt)", …), all one line, inside a bordered, scrollable
  ~12-row box; the "To stop checking…" note sits directly under it; "Languages" and "Personal
  dictionary" are top-aligned with their lists, not centred.
- **Light, same window**: identical layout, `--chrome-border` renders as a visible light-grey
  border against the white panel, scrollbar and text fully legible.
- **Narrow, native window resized to 800×900 via `SetWindowPos`** (not a viewport emulation - an
  actual OS-level resize, since the settings sidebar is a fixed 380 px column regardless of the
  app window's width): identical, correct layout - confirms the fix isn't dependent on window
  width, since the sidebar itself doesn't reflow with it.

Re-ran after this fix: `pnpm test` **554 passed** (+1, the new ordering test). `pnpm lint`,
`npx tsc --noEmit`: clean. `pnpm format`: no files needed changes. Settings files:
`presets.json`/`.window-state.json` byte-identical to a fresh backup; `settings.json` matched the
backup exactly this time (`recentFiles` was never touched - no document was opened this round).

### Stable checklist order while ticking

Supervisor found the ticked-first order (added in the layout fix above) recomputed from
`tickedLanguages` on every render, so ticking a row re-sorted the list immediately - the just-
clicked row jumped to the top, putting a different language under the pointer for a second
click. Fixed in `GeneralTab.tsx` by freezing the order instead of deriving it live: a `useRef`
holds the ticked-first, then-by-label order, computed once - during render, not in a
`useEffect`, so there's no extra frame where the list is unsorted - the first time
`supportedLanguages` arrives non-empty, and left untouched after that for as long as the tab
stays mounted (checkbox `checked` state still reads the live `tickedLanguages` every render, so
ticking still updates instantly - only the *row order* is frozen). `SettingsPanel` unmounts
`GeneralTab` whenever Settings closes (`{ !open || !loaded ? null : ... }`) or the General tab is
left, so reopening Settings (or navigating away and back) remounts it and the ref starts fresh,
re-sorting as before.

Updated `GeneralTab.test.tsx`'s ticked-first-order test (unaffected in substance - it never
ticks anything mid-test, so the frozen and the old live-sorted versions produce the same result)
and added a new one: ticks a lower, currently-unticked row (`ar-SA` among `ar-SA`/`en-US`/
`fr-FR`, `en-US` pre-ticked) and asserts the full `data-tag` order is byte-identical before and
after, while the setting and the checkbox's own `checked` state did change. 1 new test.

Checked in the running app (debug exe, `--new-window`, this session's own WebView2 folder; Vite
separate), 20 real languages, `ar-SA`/`en-US` pre-ticked: clicked the real checkbox (not the
store) for the 4th row (`ar-BH`, unticked) with Settings open - the row order before and after
the click were identical arrays (`ar-SA, en-US, ar-DZ, ar-BH, ar-EG, …`), `ar-BH`'s checkbox
switched to checked in place, and `spellLanguages` in the store picked up `ar-BH`. Closed and
reopened Settings: the order re-sorted with `ar-BH` now leading (`ar-BH, ar-SA, en-US, ar-DZ,
…`) - light-theme screenshot taken at that point shows exactly this: `Arabic (Bahrain)` at the
top of the checklist, `Arabic (Saudi Arabia)` and `English (United States)` right after, then
the rest alphabetically, full-width bordered scrollable box.

As flagged, ticking the real checkbox persists `spellLanguages` to `settings.json` (no
`persist: false` on that code path) - confirmed it landed on disk (`["ar-SA","en-US","ar-BH"]`)
and restored it to `[]` via the store's normal (persisting) `set` afterwards; `recentFiles` was
untouched (no document opened this round); `presets.json`/`.window-state.json` byte-identical to
a fresh backup throughout.

Re-ran after this fix: `pnpm test` **555 passed** (+1). `pnpm lint`, `npx tsc --noEmit`: clean.
`pnpm format`: no files needed changes.

## Supervisor check

Built by a Sonnet 5 agent over four commits (`87db9f5`, then review fixes `bcf7f9d`, `f81f1a5`,
`20ee8e5`). The run was interrupted twice by API limits and resumed with its context intact.

Review rounds:
1. Stale replies from a destroyed plugin could overwrite new squiggles; *Ignore* didn't refresh;
   the cache was per plugin (lost on every reconfigure and tab switch); `[]` was ambiguous when the
   last language was unticked (supervisor decision: the only ticked language can't be unticked);
   the cost of each check on `huge.md` was unmeasured (0.6–2 ms per run, so no windowing needed).
2. The Spelling section was cramped: the checklist sat beside its note in a row flexbox, the labels
   wrapped, and the row label was centred against a 20-language list. Now there's a full-width,
   scrolling, bordered list with ticked languages first.
3. The ticked-first sort re-sorted on every click, so rows jumped under the pointer. The order is
   now frozen while Settings is open.

Re-run by the supervisor: `pnpm test` 555 passed, lint, tsc and Prettier clean.

In-app checks by the supervisor (debug exe, `--new-window`, own WebView2 folder), with a copy of
`fixtures/spelling.md`:
- Automatic language (`en-US`): 17 squiggles, including every Arabic word. With `en-US` + `ar-SA`,
  only the misspelled Arabic word is left and the mixed line is clean. Front matter, code, links
  and maths are not underlined. Light and dark screenshots checked.
- `ignoreWord('mistaks')` removed both squiggles within 10 ms; adding `seccond` to `spellWords`
  removed it; *Check spelling* off → 0 squiggles, on → restored.
- Split view: squiggles in the editor only, none in the preview.
- Settings (dark and light screenshots): full-width scrolling list, ticked first, note underneath,
  labels top-aligned. Ticking `ar-EG` with Settings open left the order unchanged; reopening moved
  it to the top.
- Settings files byte-identical or restored to the same values afterwards.

Noted for Bilal: this PC has no English (United Kingdom) dictionary, so British spellings
("colour", "maths") are underlined until he adds that language in Windows. Pre-existing and out
of scope: YAML front matter renders as a rule and a heading in the preview and outline (offered
as a separate task).

# Keep plan sub-agents out of the running app

**Date:** 2026-09-30 · **Type:** Development

**Why:** the v1.0 plan used far more tokens than its code changes justified. From the session
transcripts, the 13 phase agents re-read about 565M tokens and the supervisor about 215M. Four phases
(2, 4, 5 and 7) used 73% of the agent total. Phase 7 was only a version bump and a regression pass,
yet it used 82M. The causes:

- agents built, launched and drove the app over CDP themselves, keeping each ~3.5k-token
  screenshot in context;
- every agent started from ~50k tokens, ~37k of them tool definitions it never used;
- hundreds of small `sed`/`cat` reads, each step re-reading the whole conversation;
- resuming an agent after a rate-limit cut-off re-sent its whole context to the cache.

The fixtures were ruled out: they account for under 1% of tokens.

**What changed:**

- A narrow [`implementer`](../../.claude/agents/implementer.md) agent type: Sonnet, only
  Read/Edit/Write/Grep/Glob/PowerShell. It never builds, launches or screenshots the app, and has
  rules for keeping a run short.
- [`CLAUDE.md`](../../CLAUDE.md): sub-agents stop at tests, lint, typecheck and cargo. The
  supervisor does the running-app checks once per batch of phases.

**Verified:** measured from the v1.0 transcripts. The new agent type loads from the next session
on; its effect should be checked on the next multi-phase plan.

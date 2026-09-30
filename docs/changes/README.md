# Change notes

Short notes for larger features and tricky bug fixes, one file per change, each linked from its
line in [`CHANGELOG.md`](../../CHANGELOG.md). Small changes need only the changelog line.

Name the file `YYYY-MM-DD-<topic>.md` and keep it under a screen long:

```markdown
# <What changed, as a title>

**Date:** YYYY-MM-DD · **Type:** Added | Changed | Fixed | Removed | Development

**Why:** the problem or request, in a sentence or two. For a bug: what went wrong and its cause.

**What changed:** the behaviour now, and the main pieces of the implementation (file links).

**Verified:** tests added or run, and the running-app checks (fixture, script, screenshot).

**Notes:** trade-offs, follow-ups, anything the next person should know. Omit if empty.
```

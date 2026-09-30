# Reusable running-app check scripts

**Date:** 2026-09-30 · **Type:** Development

**Why:** during v1.0 the supervisor and agents wrote a new throwaway CDP script for nearly every
check, and backed up and restored the app's settings by hand each time.

**What changed:** [`scripts/checks/`](../../scripts/checks/) holds the checks, described in the
README's Development section:

- `launch.ps1` / `stop.ps1` start and stop the dev app next to an installed copy, touching only
  the processes they started;
- `appdata.mjs` backs up and restores `settings.json`, `presets.json` and `.window-state.json`;
- `sweep`, `keys`, `menus`, `guide` and `settings` checks print PASS/FAIL lines;
- screenshots are half size to keep them cheap for agents to look at.

**Verified:** every check passes against the dev app. After a full launch → checks → stop cycle,
`settings.json` has the same values as before, and the installed app kept running throughout.

**Notes:** the first version of the restore lost the user's recent files. Opening more than five
fixtures pushes the user's own entries off the list, which holds five. The restore now rebuilds
the list from the backup; the lost entries were put back from an older backup.

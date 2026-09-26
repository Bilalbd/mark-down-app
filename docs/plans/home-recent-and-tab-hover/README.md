# Home-page recent paths and tab hover shapes

Two phases, each done by its own agent, in order, on branch `claude/save-recent-polish`:

| Phase | Document | Commit message |
|---|---|---|
| 1 | [phase-1-recent-paths.md](phase-1-recent-paths.md) | `Show folders next to recent files on the start screen` |
| 2 | [phase-2-tab-hover.md](phase-2-tab-hover.md) | `Give tab hover and tab buttons rounded-square shapes` |

## Decisions made by Bilal (don't change or re-discuss)

- **Start-screen recent files:** each entry shows the file name **and its folder next to it**. The
  folder is long enough to be useful but not too long. The list is left-aligned rather than
  centred line by line.
- **Tab close (×) and new/open (+) buttons:** their hover shape is a **rounded square**, like the
  toolbar's Save and Export buttons, not a circle.
- **Inactive tab hover:** the **same shape as the active tab**: rounded top corners, full height,
  touching the toolbar with **no gap**, in the soft hover colour. The tab name then sits exactly
  where it does on the active tab. No outward bottom curves on the hover shape (only the active tab
  has those).

## Rules for every agent

Follow `docs/plans/save-recent-polish/README.md` ("Rules for every agent"): it includes the
dev-app start procedure, the rule to test only on **scratch copies** of fixtures, stubbing store
actions, cropping screenshots, and restoring settings. It points to `docs/plans/tabs/README.md` for
the basics. In addition:

- The display runs at **175% scaling** (`devicePixelRatio` 1.75). Screenshots are in device pixels,
  so multiply CSS coordinates by 1.75 when you crop, and read `getBoundingClientRect()` first so you
  crop the right area. Open every crop with the Read tool and check it shows what you meant to crop
  before describing it.
- **Your recent-files check changes the user's real settings** (the dev app shares them). Read
  `recentFiles` first and put back **exactly** that list at the end. Paste both lists in your reply.
- Never delete or weaken tests. No `any`, no eslint-disable comments.

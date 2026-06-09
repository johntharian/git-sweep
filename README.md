# 🧹 git-sweep

> Clean up stale local Git branches — safely and interactively.

`git-sweep` scans the local branches in your current repository, finds the ones
that haven't seen a commit in a while, and helps you delete them. It is
deliberately cautious: it never touches your current branch, skips protected
branches like `main`, and refuses to delete any branch that still has an
associated stash — so you won't lose work in progress.

No raw `git` output is ever shown. You get clear, colored, human-readable
messages and a tidy summary of exactly what happened and why.

---

## Table of contents

- [Features](#features)
- [Install](#install)
- [Usage](#usage)
  - [Flags](#flags)
  - [Interactive mode](#interactive-mode-default)
  - [Example output](#example-output)
- [How it works](#how-it-works)
- [Stash protection](#stash-protection)
- [Merged & remote-deleted branches](#merged--remote-deleted-branches)
- [Output legend](#output-legend)
- [Exit codes](#exit-codes)
- [Project structure](#project-structure)
- [Local development](#local-development)
- [Testing](#testing)
- [License](#license)

---

## Features

- 🔍 Detects local branches with **no commits in the past N weeks** (default: 3,
  configurable with `--weeks`).
- 🪂 Detects branches whose **remote was deleted** ("gone" upstream — the usual
  state after a PR is merged and the branch auto-deleted). These are offered for
  deletion regardless of age.
- 🔀 Flags branches **already merged into the base branch** with a `[merged]`
  tag (auto-detected base, overridable with `--base`). Merged-but-fresh branches
  are shown for awareness but kept.
- 🛟 **Skips any branch that owns a stash** — your work-in-progress is protected.
- 🚫 **Never deletes the current branch** and skips protected branches
  (`main`, `master`, `develop` by default; extend with `--protect`).
- ✅ **Interactive checklist** by default — review and pick before anything is
  deleted, with a final confirmation gate.
- 🧪 **Dry-run mode** to preview without touching anything.
- 🛡️ Uses **safe delete** (`git branch -d`) by default, so Git warns you about
  unmerged branches instead of silently dropping them. `--force` switches to
  `git branch -D`.
- 🎨 Colored, readable output with a clear deleted-vs-skipped summary.

## Install

```bash
npm install -g @johntharian/git-sweep
```

This installs a global `git-sweep` command (the command stays `git-sweep` even
though the package is scoped). Run it from inside any Git repository.

> **Requires Node.js 18 or newer.**

## Usage

```bash
git-sweep                            # interactive checklist of candidate branches
git-sweep --dry-run                  # list candidates, delete nothing
git-sweep --force                    # skip confirmation, delete all candidates
git-sweep --weeks=4                  # use a 4-week inactivity threshold
git-sweep --protect=release,staging  # protect extra branches by name
git-sweep --base=develop             # check merges/gone against develop
```

Flags can be combined, e.g. `git-sweep --weeks=6 --protect=release`.

### Flags

| Flag                | Description                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `--dry-run`         | Preview candidate branches without deleting anything.                                             |
| `--force`           | Skip the prompt and force-delete (`git branch -D`) all candidates. Stashed branches are still skipped. |
| `--weeks=<n>`       | Inactivity threshold in weeks (default: `3`). Must be a non-negative integer.                     |
| `--protect=<names>` | Comma-separated branch names to protect, **in addition to** the built-in `main`, `master`, `develop`. |
| `--base=<branch>`   | Base branch to check "merged" and "gone" status against. Auto-detected (`origin/HEAD` → first of `main`/`master`/`develop`) when omitted. |
| `-h, --help`        | Show usage.                                                                                       |

A branch is offered for deletion when it is **stale OR its remote is gone**
(while never touching the current, protected, or stashed branches). Being merged
is informational only — it never, on its own, makes a branch a deletion target.

### Interactive mode (default)

Running `git-sweep` with no flags opens a multi-select checklist:

```
? Select branches to delete:
 ◉ feature/old-login   (last commit: 28 days ago)
 ◉ spike/cache-poc     (last commit: 41 days ago) [merged]
 ◉ feat/cart           (last commit: 3 days ago) [gone]
 ◯ wip/payments        (last commit: 22 days ago)  [has stash — skipped]
```

Candidate branches (stale or gone) are **pre-checked**, annotated with `[gone]`
and `[merged]` tags where relevant. Branches with a stash are shown but
**disabled**, so they can't be selected by accident. After you choose,
`git-sweep` asks for a final confirmation before anything is deleted.

### Example output

A `--dry-run` against a repo with a mix of branches:

```
✔ Scanned 6 local branches (base: main).

Dry run — stale threshold: 3 weeks, base: main. Nothing will be deleted.

Would delete (2):
  🔴 feat/cart  (last commit: 3 days ago) [gone]
  🔴 stale-old  (last commit: 45 days ago)

Skipped — stash found (1):
  🟡 stale-stash  (last commit: 60 days ago) [has stash]

Merged into main, but still fresh — kept (1):
  ⚪ feat/login  (last commit: 4 days ago) [merged]

Protected / current (2):
  ⚪ develop (protected)
  ⚪ main (current)
```

The closing summary after a real run:

```
── Summary ──────────────────────────
🟢 Deleted: 2
   🔴 feat/cart
   🔴 stale-old
🟡 Skipped — stash found: 1
   🟡 stale-stash
⚪ Merged into main but kept (fresh): 1
   ⚪ feat/login
⚪ Skipped — protected/current: 2
   ⚪ develop (protected)
   ⚪ main (current)
```

## How it works

1. **Resolve the base & refresh.** The base branch is auto-detected from
   `origin/HEAD` (falling back to the first of `main`/`master`/`develop`), or
   taken from `--base`. If the repo has a remote, `git-sweep` runs
   `git fetch --prune` so "gone" status is accurate — best-effort, so an
   offline run just warns and continues with cached remote state.
2. **Scan.** With a single `git for-each-ref`, `git-sweep` reads every local
   branch, the timestamp of its most recent commit, and whether its upstream is
   gone. A separate `git branch --merged <base>` marks merged branches.
3. **Classify.** Each branch is flagged as current, protected, stashed, stale,
   merged, and/or gone. A branch is *stale* when its last commit is at least
   `weeks × 7` days old (inclusive). It's a deletion **candidate** when it is
   *stale or gone*.
4. **Bucket.** Branches are sorted by precedence into: protected/current
   (always skipped) → not-a-candidate (left alone; merged-but-fresh shown for
   awareness) → candidate-with-stash (skipped) → deletable.
5. **Decide.** Depending on the flags, `git-sweep` previews (`--dry-run`),
   deletes everything eligible (`--force`), or opens the interactive checklist.
6. **Delete & report.** Deletions run one at a time; a failure on one branch
   (e.g. an unmerged branch under safe delete) is reported with a friendly
   reason and the sweep continues. A colored summary closes things out.

All Git interaction goes through [`simple-git`](https://github.com/steveukx/git-js) —
`git-sweep` never shells out to `child_process` directly.

## Stash protection

Before deleting, `git-sweep` reads `git stash list` and parses the branch each
stash was created on. Stash entries look like:

```
stash@{0}: WIP on feature-x: 1a2b3c4 commit message
stash@{1}: On release: a custom stash label
```

Both the `WIP on <branch>:` and `On <branch>:` formats are recognized. If a
stale branch owns one or more stashes, it is **shown but never deleted**:

- In interactive mode it appears **disabled** with a `[has stash — skipped]`
  label, so it can't be selected.
- In `--force` mode it is skipped entirely.

This prevents you from losing uncommitted work that's parked in a stash.

## Merged & remote-deleted branches

`git-sweep` looks at two additional "this branch is done" signals, relative to
the base branch (auto-detected, or set with `--base`):

- **Merged** (`[merged]` tag) — the branch is already merged into the base
  (`git branch --merged <base>`). This is **informational only**: a merged
  branch is *not* deleted unless it's also stale or gone. Merged-but-fresh
  branches are listed in a "kept" section so you can see them without risk.
- **Gone** (`[gone]` tag) — the branch's upstream tracking branch no longer
  exists, i.e. the remote branch was deleted (typically after a PR merge). Gone
  branches **are** deletion candidates, regardless of how recent their last
  commit is.

To keep "gone" accurate, `git-sweep` runs `git fetch --prune` before scanning
whenever the repo has a remote. This only refreshes remote-tracking refs (it
never touches your local branches or working tree), and it runs in `--dry-run`
too so the preview is truthful. With no remote, or when offline, the fetch is
skipped/ignored and the scan proceeds with whatever state is cached locally.

> **Note on squash/rebase merges.** A branch merged via *squash* or *rebase*
> often shows as `[gone]` but is **not** recognized as merged by safe delete
> (`git branch -d`), since its commits aren't ancestors of the base. Deleting it
> will fail with *"not fully merged — re-run with --force"*; use `--force` to
> remove it. `git-sweep` isolates such failures per-branch and keeps going.

## Output legend

| Color / tag  | Meaning                                                  |
| ------------ | -------------------------------------------------------- |
| 🔴 Red       | Branch deleted                                           |
| 🟡 Yellow    | Skipped because a stash was found (or a delete failed)   |
| 🟢 Green     | Success summary                                          |
| ⚪ Gray      | Skipped/kept — protected, current, or merged-but-fresh   |
| `[merged]`   | Already merged into the base branch (informational)      |
| `[gone]`     | Upstream was deleted on the remote (a deletion candidate)|

## Exit codes

| Code | When                                                                          |
| ---- | ----------------------------------------------------------------------------- |
| `0`  | Success — including "all clean", dry-run, and runs where some branches were kept. |
| `1`  | Not inside a Git repository, an invalid flag value, or a fatal read error.    |

## Project structure

```
git-sweep/
├── bin/
│   └── git-sweep.js     # CLI entry point — flag parsing (commander)
├── src/
│   ├── index.js         # main orchestration logic
│   ├── git.js           # all Git operations + pure output parsers (simple-git)
│   ├── filter.js        # staleness / merged / gone / stash filtering (pure)
│   └── ui.js            # chalk output helpers + inquirer prompts
├── test/
│   ├── filter.test.js   # classify / partition logic
│   ├── git.test.js      # branch-ref and stash-list parsers
│   └── index.test.js    # error-message mapping
├── package.json
└── README.md
```

## Local development

```bash
npm install
npm start                # runs node bin/git-sweep.js in the current repo
npm start -- --dry-run   # pass flags through with --
```

## Testing

Tests use Node's built-in test runner (`node:test`) — no extra dependencies.
The pure logic (staleness/bucketing in `filter.js`, the `for-each-ref` and
`git stash list` parsers in `git.js`, and error-message mapping) is covered
directly, so the suite runs fast and needs no scratch repository.

```bash
npm test
```

## License

MIT

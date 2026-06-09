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
git-sweep                            # interactive checklist of stale branches
git-sweep --dry-run                  # list stale branches, delete nothing
git-sweep --force                    # skip confirmation, delete all stale branches
git-sweep --weeks=4                  # use a 4-week inactivity threshold
git-sweep --protect=release,staging  # protect extra branches by name
```

Flags can be combined, e.g. `git-sweep --weeks=6 --protect=release`.

### Flags

| Flag                | Description                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `--dry-run`         | Preview stale branches without deleting anything.                                                 |
| `--force`           | Skip the prompt and force-delete (`git branch -D`) all stale branches. Stashed branches are still skipped. |
| `--weeks=<n>`       | Inactivity threshold in weeks (default: `3`). Must be a non-negative integer.                     |
| `--protect=<names>` | Comma-separated branch names to protect, **in addition to** the built-in `main`, `master`, `develop`. |
| `-h, --help`        | Show usage.                                                                                       |

### Interactive mode (default)

Running `git-sweep` with no flags opens a multi-select checklist:

```
? Select stale branches to delete:
 ◉ feature/old-login   (last commit: 28 days ago)
 ◉ spike/cache-poc     (last commit: 41 days ago)
 ◯ wip/payments        (last commit: 22 days ago)  [has stash — skipped]
```

Stale branches are **pre-checked**. Branches with a stash are shown but
**disabled**, so they can't be selected by accident. After you choose,
`git-sweep` asks for a final confirmation before anything is deleted.

### Example output

A `--dry-run` against a repo with a mix of branches:

```
✔ Scanned 6 local branches.

Dry run — stale threshold: 3 weeks. Nothing will be deleted.

Would delete (2):
  🔴 stale-merged  (last commit: 50 days ago)
  🔴 stale-old  (last commit: 45 days ago)

Skipped — stash found (1):
  🟡 stale-stash  (last commit: 60 days ago) [has stash]

Protected / current (2):
  ⚪ develop (protected)
  ⚪ main (current)
```

The closing summary after a real run:

```
── Summary ──────────────────────────
🟢 Deleted: 2
   🔴 stale-merged
   🔴 stale-old
🟡 Skipped — stash found: 1
   🟡 stale-stash
⚪ Skipped — protected/current: 2
   ⚪ develop (protected)
   ⚪ main (current)
```

## How it works

1. **Scan.** With a single `git for-each-ref`, `git-sweep` reads every local
   branch and the timestamp of its most recent commit.
2. **Classify.** Each branch is flagged as current, protected, stashed, and/or
   stale. A branch is *stale* when its last commit is at least `weeks × 7` days
   old (the threshold is inclusive).
3. **Bucket.** Branches are sorted by precedence into: protected/current
   (always skipped) → fresh (left alone) → stale-with-stash (skipped) →
   deletable.
4. **Decide.** Depending on the flags, `git-sweep` previews (`--dry-run`),
   deletes everything eligible (`--force`), or opens the interactive checklist.
5. **Delete & report.** Deletions run one at a time; a failure on one branch
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

## Output legend

| Color        | Meaning                                                  |
| ------------ | -------------------------------------------------------- |
| 🔴 Red       | Branch deleted                                           |
| 🟡 Yellow    | Skipped because a stash was found (or a delete failed)   |
| 🟢 Green     | Success summary                                          |
| ⚪ Gray      | Skipped because it's protected or currently checked out  |

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
│   ├── filter.js        # staleness + stash-check filtering (pure)
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

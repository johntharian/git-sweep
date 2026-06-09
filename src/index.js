// Main orchestration: scan -> classify -> decide -> delete -> summarize.
import ora from 'ora';
import * as git from './git.js';
import { classifyBranches, partition } from './filter.js';
import * as ui from './ui.js';

const DEFAULT_PROTECTED = ['main', 'master', 'develop'];

/** Turn a simple-git error into a short, friendly reason — never raw git output. */
export function friendlyReason(err) {
  const message = (err && err.message ? err.message : String(err)).toLowerCase();
  if (message.includes('not fully merged')) {
    return 'not fully merged — re-run with --force to delete anyway';
  }
  if (message.includes('checked out')) {
    return 'currently checked out';
  }
  return 'deletion failed';
}

/**
 * @param {object} opts
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.force]
 * @param {number}  [opts.weeks]
 * @param {string[]} [opts.protect]
 * @param {string}  [opts.base]  base branch for merged/gone checks (auto-detected)
 */
export async function run(opts = {}) {
  const weeks = Number.isFinite(opts.weeks) ? opts.weeks : 3;
  const thresholdDays = weeks * 7;
  const protectedBranches = [...DEFAULT_PROTECTED, ...(opts.protect ?? [])];

  const spinner = ora('Scanning branches…').start();

  if (!(await git.isGitRepo())) {
    spinner.stop();
    ui.error('Not a Git repository. Run git-sweep from inside a Git project.');
    process.exitCode = 1;
    return;
  }

  // Resolve the base branch used for "merged" and (indirectly) "gone" context.
  const base = opts.base ?? (await git.getDefaultBranch());

  // Refresh remote-tracking refs so "gone" status is accurate. Best-effort:
  // skip when there's no remote, and keep going (with cached state) if offline.
  let fetchFailed = false;
  if (await git.hasRemotes()) {
    spinner.text = 'Fetching remote state…';
    try {
      await git.fetchPrune();
    } catch {
      fetchFailed = true;
    }
    spinner.text = 'Scanning branches…';
  }

  let currentBranch;
  let branches;
  let stashBranches;
  let mergedBranches;
  try {
    [currentBranch, branches, stashBranches, mergedBranches] = await Promise.all([
      git.getCurrentBranch(),
      git.getLocalBranches(),
      git.getStashBranches(),
      git.getMergedBranches(base),
    ]);
  } catch (err) {
    spinner.stop();
    ui.error(`Could not read repository data: ${friendlyReason(err)}`);
    process.exitCode = 1;
    return;
  }

  const classified = classifyBranches(branches, {
    currentBranch,
    protectedBranches,
    stashBranches,
    mergedBranches,
    thresholdDays,
  });
  const { protectedOrCurrent, fresh, stashSkipped, deletable } = partition(classified);

  // Merged into base but not yet a deletion candidate — surfaced for awareness.
  const mergedFresh = fresh.filter((b) => b.isMerged);

  spinner.succeed(
    `Scanned ${branches.length} local branch${branches.length === 1 ? '' : 'es'} (base: ${base}).`
  );

  if (fetchFailed) {
    ui.info("Couldn't reach the remote — using cached remote state for 'gone' status.");
  }

  // No deletion candidates (no stale or gone branches without stashes).
  if (deletable.length === 0 && stashSkipped.length === 0) {
    ui.allClean(weeks);
    if (mergedFresh.length) ui.mergedFreshNotice(mergedFresh, base);
    return;
  }

  // Preview only.
  if (opts.dryRun) {
    ui.dryRunReport({ deletable, stashSkipped, protectedOrCurrent, mergedFresh, base, weeks });
    return;
  }

  // Decide which branches to actually delete.
  let toDelete;

  if (opts.force) {
    toDelete = deletable.map((b) => b.name);
    if (toDelete.length === 0) {
      ui.info('The only candidate branches have stashes — nothing to force-delete.');
    } else {
      ui.info(`Force mode: deleting ${toDelete.length} branch(es) with git -D.`);
    }
  } else if (deletable.length === 0) {
    // Interactive, but every candidate branch is stash-protected.
    ui.info('All candidate branches have stashes and were skipped.');
    toDelete = [];
  } else {
    const selected = await ui.promptSelection(deletable, stashSkipped);
    if (selected.length === 0) {
      ui.info('Nothing selected.');
      toDelete = [];
    } else if (!(await ui.confirmDeletion(selected))) {
      ui.info('Cancelled — no branches deleted.');
      toDelete = [];
    } else {
      toDelete = selected;
    }
  }

  // Execute deletions, isolating per-branch failures.
  const deleted = [];
  const failed = [];

  for (const name of toDelete) {
    try {
      await git.deleteBranch(name, Boolean(opts.force));
      deleted.push(name);
      ui.reportDeleted(name);
    } catch (err) {
      const reason = friendlyReason(err);
      failed.push({ name, reason });
      ui.reportFailed(name, reason);
    }
  }

  ui.summary({ deleted, failed, stashSkipped, protectedOrCurrent, mergedFresh, base });
}

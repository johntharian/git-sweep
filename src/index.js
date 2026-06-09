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

  let currentBranch;
  let branches;
  let stashBranches;
  try {
    [currentBranch, branches, stashBranches] = await Promise.all([
      git.getCurrentBranch(),
      git.getLocalBranches(),
      git.getStashBranches(),
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
    thresholdDays,
  });
  const { protectedOrCurrent, stashSkipped, deletable } = partition(classified);

  spinner.succeed(
    `Scanned ${branches.length} local branch${branches.length === 1 ? '' : 'es'}.`
  );

  // Nothing stale at all (stashed-but-stale still counts as "something to report").
  if (deletable.length === 0 && stashSkipped.length === 0) {
    ui.allClean(weeks);
    return;
  }

  // Preview only.
  if (opts.dryRun) {
    ui.dryRunReport({ deletable, stashSkipped, protectedOrCurrent, weeks });
    return;
  }

  // Decide which branches to actually delete.
  let toDelete;

  if (opts.force) {
    toDelete = deletable.map((b) => b.name);
    if (toDelete.length === 0) {
      ui.info('The only stale branches have stashes — nothing to force-delete.');
    } else {
      ui.info(`Force mode: deleting ${toDelete.length} stale branch(es) with git -D.`);
    }
  } else if (deletable.length === 0) {
    // Interactive, but every stale branch is stash-protected.
    ui.info('All stale branches have stashes and were skipped.');
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

  ui.summary({ deleted, failed, stashSkipped, protectedOrCurrent });
}

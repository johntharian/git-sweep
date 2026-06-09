// All Git operations live here. Everything goes through simple-git — we never
// shell out to child_process directly. `git.raw(...)` is simple-git's escape
// hatch for commands it doesn't wrap, so it still counts as "via simple-git".
import { simpleGit } from 'simple-git';

const git = simpleGit();

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Parse the output of our `for-each-ref` call into branch records.
 * Pure (no I/O) so it can be unit-tested directly.
 *
 * @param {string} raw    tab-separated "name\tISO-date" lines.
 * @param {number} nowMs  reference "now" in epoch ms (injected for determinism).
 * @returns {Array<{ name: string, lastCommit: Date, daysAgo: number }>}
 */
export function parseBranchRefs(raw, nowMs = Date.now()) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, dateStr] = line.split('\t');
      const lastCommit = new Date(dateStr);
      const daysAgo = Math.floor((nowMs - lastCommit.getTime()) / MS_PER_DAY);
      return { name, lastCommit, daysAgo };
    });
}

/**
 * Extract the branch names that own a stash from `git stash list` output.
 * Pure (no I/O) so it can be unit-tested directly.
 *
 * Stash list lines look like:
 *   stash@{0}: WIP on feature-x: 1a2b3c4 commit message
 *   stash@{1}: On feature-y: a custom stash message
 *
 * @param {string} raw
 * @returns {string[]} unique branch names that own at least one stash.
 */
export function parseStashBranches(raw) {
  const branches = new Set();
  for (const line of raw.split('\n')) {
    const match = line.match(/^stash@\{\d+\}:\s+(?:WIP on|On)\s+([^:]+):/);
    if (match) {
      branches.add(match[1].trim());
    }
  }
  return [...branches];
}

/**
 * @returns {Promise<boolean>} true when the current directory is inside a repo.
 */
export async function isGitRepo() {
  try {
    return await git.checkIsRepo();
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<string>} the checked-out branch name, or 'HEAD' if detached.
 */
export async function getCurrentBranch() {
  const out = await git.revparse(['--abbrev-ref', 'HEAD']);
  return out.trim();
}

/**
 * List local branches with the timestamp of their last commit.
 * Uses a single `for-each-ref` call rather than N log calls.
 *
 * @returns {Promise<Array<{ name: string, lastCommit: Date, daysAgo: number }>>}
 */
export async function getLocalBranches() {
  // %09 is a literal tab — a safe delimiter for branch names and ISO dates.
  const raw = await git.raw([
    'for-each-ref',
    '--format=%(refname:short)%09%(committerdate:iso8601)',
    'refs/heads/',
  ]);

  return parseBranchRefs(raw, Date.now());
}

/**
 * Find which branches have an associated stash entry.
 *
 * @returns {Promise<string[]>} unique branch names that own at least one stash.
 */
export async function getStashBranches() {
  const raw = await git.raw(['stash', 'list']);
  return parseStashBranches(raw);
}

/**
 * Delete a local branch.
 *
 * @param {string} name
 * @param {boolean} force  when true uses `git branch -D`, otherwise `-d` (safe).
 * @returns {Promise<import('simple-git').BranchSingleDeleteResult>}
 */
export async function deleteBranch(name, force) {
  return git.deleteLocalBranch(name, force);
}

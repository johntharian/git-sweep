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
 * Each line is tab-separated: "name\tISO-date\ttrack-info". The third field
 * is git's `%(upstream:track)` — it reads `[gone]` when the branch's upstream
 * (remote tracking branch) has been deleted, `[ahead 1, behind 2]` otherwise,
 * or is empty when there's no upstream. The field is optional so older two-
 * field input still parses (with `isGone === false`).
 *
 * @param {string} raw    tab-separated "name\tISO-date\ttrack-info" lines.
 * @param {number} nowMs  reference "now" in epoch ms (injected for determinism).
 * @returns {Array<{ name: string, lastCommit: Date, daysAgo: number, isGone: boolean }>}
 */
export function parseBranchRefs(raw, nowMs = Date.now()) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, dateStr, track = ''] = line.split('\t');
      const lastCommit = new Date(dateStr);
      const daysAgo = Math.floor((nowMs - lastCommit.getTime()) / MS_PER_DAY);
      const isGone = track.includes('gone');
      return { name, lastCommit, daysAgo, isGone };
    });
}

/**
 * Parse `git branch --merged <base> --format=%(refname:short)` output into a
 * list of branch names. Pure (no I/O) so it can be unit-tested directly.
 *
 * @param {string} raw  newline-separated branch names.
 * @returns {string[]}
 */
export function parseMergedBranches(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Extract the short branch name from a symbolic ref like
 * `refs/remotes/origin/main` -> `main`. Pure (no I/O).
 *
 * @param {string} ref
 * @returns {string}
 */
export function parseDefaultBranchRef(ref) {
  return ref.trim().split('/').pop();
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
 * List local branches with the timestamp of their last commit and whether
 * their upstream is gone. Uses a single `for-each-ref` call rather than N
 * log calls.
 *
 * @returns {Promise<Array<{ name: string, lastCommit: Date, daysAgo: number, isGone: boolean }>>}
 */
export async function getLocalBranches() {
  // %09 is a literal tab — a safe delimiter between name, date, and track info.
  const raw = await git.raw([
    'for-each-ref',
    '--format=%(refname:short)%09%(committerdate:iso8601)%09%(upstream:track)',
    'refs/heads/',
  ]);

  return parseBranchRefs(raw, Date.now());
}

/**
 * List local branches already merged into the given base branch.
 * Note: the base branch and current branch appear in this list (a branch is
 * merged into itself) — callers treat that as harmless.
 *
 * @param {string} base
 * @returns {Promise<string[]>}
 */
export async function getMergedBranches(base) {
  const raw = await git.raw(['branch', '--merged', base, '--format=%(refname:short)']);
  return parseMergedBranches(raw);
}

/**
 * Best-effort detection of the repository's default/base branch.
 * Tries the remote's HEAD pointer first, then falls back to the first of
 * main/master/develop that exists locally, then 'main' as a last resort.
 *
 * @returns {Promise<string>}
 */
export async function getDefaultBranch() {
  try {
    const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
    const name = parseDefaultBranchRef(ref);
    if (name) return name;
  } catch {
    // No remote HEAD configured — fall through to local heuristics.
  }

  const localNames = new Set((await getLocalBranches()).map((b) => b.name));
  for (const candidate of ['main', 'master', 'develop']) {
    if (localNames.has(candidate)) return candidate;
  }
  return 'main';
}

/**
 * @returns {Promise<boolean>} true when the repo has at least one remote.
 */
export async function hasRemotes() {
  try {
    return (await git.getRemotes()).length > 0;
  } catch {
    return false;
  }
}

/**
 * Refresh remote-tracking refs and prune deleted ones so "gone" status is
 * accurate. Lets the caller decide how to handle failures (e.g. offline).
 *
 * @returns {Promise<void>}
 */
export async function fetchPrune() {
  await git.raw(['fetch', '--prune']);
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

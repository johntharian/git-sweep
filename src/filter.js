// Pure functions for deciding what is stale and what should be skipped.
// No I/O here so the logic stays easy to reason about and test.

/**
 * Annotate each branch with the flags that drive sweep decisions.
 *
 * @param {Array<{ name: string, lastCommit: Date, daysAgo: number, isGone?: boolean }>} branches
 * @param {object} ctx
 * @param {string}   ctx.currentBranch
 * @param {string[]} ctx.protectedBranches
 * @param {string[]} ctx.stashBranches
 * @param {string[]} [ctx.mergedBranches]  names merged into the base branch
 * @param {number}   ctx.thresholdDays  inactivity threshold in days
 */
export function classifyBranches(
  branches,
  { currentBranch, protectedBranches, stashBranches, mergedBranches = [], thresholdDays }
) {
  const protectedSet = new Set(protectedBranches);
  const stashSet = new Set(stashBranches);
  const mergedSet = new Set(mergedBranches);

  return branches.map((b) => ({
    ...b,
    isCurrent: b.name === currentBranch,
    isProtected: protectedSet.has(b.name),
    hasStash: stashSet.has(b.name),
    isStale: b.daysAgo >= thresholdDays,
    isMerged: mergedSet.has(b.name),
    isGone: Boolean(b.isGone),
  }));
}

/**
 * Split classified branches into the buckets the UI cares about.
 *
 * A branch is a deletion *candidate* when it is stale OR its upstream is gone.
 * Being merged is informational only and never makes a branch a candidate.
 *
 * Precedence (a branch lands in exactly one bucket):
 *   1. current or protected     -> always skipped, never offered for deletion
 *   2. not a candidate          -> left alone (fresh; merged-but-fresh lives here)
 *   3. candidate + has stash    -> shown but skipped (work in progress)
 *   4. candidate, no stash       -> eligible for deletion
 */
export function partition(classified) {
  const protectedOrCurrent = [];
  const fresh = [];
  const stashSkipped = [];
  const deletable = [];

  for (const b of classified) {
    const isCandidate = b.isStale || b.isGone;
    if (b.isCurrent || b.isProtected) {
      protectedOrCurrent.push(b);
    } else if (!isCandidate) {
      fresh.push(b);
    } else if (b.hasStash) {
      stashSkipped.push(b);
    } else {
      deletable.push(b);
    }
  }

  return { protectedOrCurrent, fresh, stashSkipped, deletable };
}

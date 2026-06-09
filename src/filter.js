// Pure functions for deciding what is stale and what should be skipped.
// No I/O here so the logic stays easy to reason about and test.

/**
 * Annotate each branch with the flags that drive sweep decisions.
 *
 * @param {Array<{ name: string, lastCommit: Date, daysAgo: number }>} branches
 * @param {object} ctx
 * @param {string}   ctx.currentBranch
 * @param {string[]} ctx.protectedBranches
 * @param {string[]} ctx.stashBranches
 * @param {number}   ctx.thresholdDays  inactivity threshold in days
 */
export function classifyBranches(
  branches,
  { currentBranch, protectedBranches, stashBranches, thresholdDays }
) {
  const protectedSet = new Set(protectedBranches);
  const stashSet = new Set(stashBranches);

  return branches.map((b) => ({
    ...b,
    isCurrent: b.name === currentBranch,
    isProtected: protectedSet.has(b.name),
    hasStash: stashSet.has(b.name),
    isStale: b.daysAgo >= thresholdDays,
  }));
}

/**
 * Split classified branches into the buckets the UI cares about.
 *
 * Precedence (a branch lands in exactly one bucket):
 *   1. current or protected  -> always skipped, never offered for deletion
 *   2. not stale             -> left alone
 *   3. stale + has stash     -> shown but skipped (work in progress)
 *   4. stale, no stash       -> eligible for deletion
 */
export function partition(classified) {
  const protectedOrCurrent = [];
  const fresh = [];
  const stashSkipped = [];
  const deletable = [];

  for (const b of classified) {
    if (b.isCurrent || b.isProtected) {
      protectedOrCurrent.push(b);
    } else if (!b.isStale) {
      fresh.push(b);
    } else if (b.hasStash) {
      stashSkipped.push(b);
    } else {
      deletable.push(b);
    }
  }

  return { protectedOrCurrent, fresh, stashSkipped, deletable };
}

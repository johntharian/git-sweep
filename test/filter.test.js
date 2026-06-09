import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBranches, partition } from '../src/filter.js';

// A small helper to build branch records without repeating the shape everywhere.
const branch = (name, daysAgo) => ({
  name,
  lastCommit: new Date(),
  daysAgo,
});

const ctx = (overrides = {}) => ({
  currentBranch: 'main',
  protectedBranches: ['main', 'master', 'develop'],
  stashBranches: [],
  thresholdDays: 21, // 3 weeks
  ...overrides,
});

test('classifyBranches: flags current, protected, stash and staleness', () => {
  const branches = [
    branch('main', 0),
    branch('develop', 100),
    branch('feature-fresh', 5),
    branch('feature-old', 40),
    branch('feature-wip', 50),
  ];

  const result = classifyBranches(
    branches,
    ctx({ stashBranches: ['feature-wip'] })
  );

  const byName = Object.fromEntries(result.map((b) => [b.name, b]));

  assert.equal(byName['main'].isCurrent, true);
  assert.equal(byName['main'].isProtected, true); // also in protected list
  assert.equal(byName['develop'].isProtected, true);
  assert.equal(byName['develop'].isStale, true);

  assert.equal(byName['feature-fresh'].isStale, false);
  assert.equal(byName['feature-old'].isStale, true);
  assert.equal(byName['feature-old'].hasStash, false);

  assert.equal(byName['feature-wip'].isStale, true);
  assert.equal(byName['feature-wip'].hasStash, true);
});

test('classifyBranches: staleness boundary is inclusive at the threshold', () => {
  const branches = [
    branch('exactly-at', 21),
    branch('one-under', 20),
    branch('one-over', 22),
  ];
  const result = classifyBranches(branches, ctx({ currentBranch: 'none' }));
  const byName = Object.fromEntries(result.map((b) => [b.name, b]));

  assert.equal(byName['exactly-at'].isStale, true, '>= threshold is stale');
  assert.equal(byName['one-under'].isStale, false);
  assert.equal(byName['one-over'].isStale, true);
});

test('classifyBranches: respects a custom threshold', () => {
  const branches = [branch('feature', 25)];
  const at3wk = classifyBranches(branches, ctx({ thresholdDays: 21 }));
  const at4wk = classifyBranches(branches, ctx({ thresholdDays: 28 }));

  assert.equal(at3wk[0].isStale, true);
  assert.equal(at4wk[0].isStale, false);
});

test('classifyBranches: extra protected names are honored', () => {
  const branches = [branch('release', 90), branch('staging', 90)];
  const result = classifyBranches(
    branches,
    ctx({ protectedBranches: ['main', 'release', 'staging'] })
  );
  assert.equal(result[0].isProtected, true);
  assert.equal(result[1].isProtected, true);
});

test('partition: routes each branch into exactly one bucket by precedence', () => {
  const classified = classifyBranches(
    [
      branch('main', 0), // current + protected
      branch('develop', 100), // protected (stale but protected wins)
      branch('feature-fresh', 5), // fresh
      branch('feature-old', 40), // deletable
      branch('feature-wip', 50), // stale + stash
    ],
    ctx({ stashBranches: ['feature-wip'] })
  );

  const { protectedOrCurrent, fresh, stashSkipped, deletable } = partition(classified);

  assert.deepEqual(
    protectedOrCurrent.map((b) => b.name).sort(),
    ['develop', 'main']
  );
  assert.deepEqual(fresh.map((b) => b.name), ['feature-fresh']);
  assert.deepEqual(stashSkipped.map((b) => b.name), ['feature-wip']);
  assert.deepEqual(deletable.map((b) => b.name), ['feature-old']);

  // Every input lands in exactly one bucket — no loss, no duplication.
  const total =
    protectedOrCurrent.length + fresh.length + stashSkipped.length + deletable.length;
  assert.equal(total, classified.length);
});

test('partition: protected wins over stale, current wins over deletable', () => {
  const classified = classifyBranches(
    [branch('develop', 365), branch('main', 365)],
    ctx({ currentBranch: 'main' })
  );
  const { protectedOrCurrent, deletable, stashSkipped, fresh } = partition(classified);

  assert.equal(deletable.length, 0);
  assert.equal(stashSkipped.length, 0);
  assert.equal(fresh.length, 0);
  assert.equal(protectedOrCurrent.length, 2);
});

test('partition: a stale branch with a stash is skipped, not deletable', () => {
  const classified = classifyBranches(
    [branch('feature-wip', 99)],
    ctx({ currentBranch: 'none', stashBranches: ['feature-wip'] })
  );
  const { stashSkipped, deletable } = partition(classified);

  assert.deepEqual(stashSkipped.map((b) => b.name), ['feature-wip']);
  assert.equal(deletable.length, 0);
});

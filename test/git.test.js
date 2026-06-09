import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBranchRefs, parseStashBranches } from '../src/git.js';

const DAY = 1000 * 60 * 60 * 24;

test('parseBranchRefs: parses name + date and computes whole days ago', () => {
  const now = Date.parse('2026-06-09T12:00:00Z');
  const raw = [
    `main\t2026-06-09T00:00:00Z`, // ~0 days ago
    `feature-old\t2026-04-30T12:00:00Z`, // 40 days ago
  ].join('\n');

  const result = parseBranchRefs(raw, now);

  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'main');
  assert.equal(result[0].daysAgo, 0);
  assert.ok(result[0].lastCommit instanceof Date);

  assert.equal(result[1].name, 'feature-old');
  assert.equal(result[1].daysAgo, 40);
});

test('parseBranchRefs: ignores blank lines and trailing whitespace', () => {
  const now = Date.parse('2026-06-09T00:00:00Z');
  const raw = `\n  main\t2026-06-09T00:00:00Z  \n\n`;
  const result = parseBranchRefs(raw, now);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'main');
});

test('parseBranchRefs: empty output yields an empty array', () => {
  assert.deepEqual(parseBranchRefs('', Date.now()), []);
  assert.deepEqual(parseBranchRefs('\n  \n', Date.now()), []);
});

test('parseBranchRefs: handles branch names that contain slashes', () => {
  const now = Date.parse('2026-06-09T00:00:00Z');
  const raw = `feature/JIRA-123/login\t2026-05-10T00:00:00Z`;
  const [b] = parseBranchRefs(raw, now);
  assert.equal(b.name, 'feature/JIRA-123/login');
  assert.equal(b.daysAgo, 30);
});

test('parseBranchRefs: daysAgo floors partial days', () => {
  const now = Date.parse('2026-06-09T00:00:00Z');
  const raw = `b\t${new Date(now - DAY * 2.9).toISOString()}`;
  const [b] = parseBranchRefs(raw, now);
  assert.equal(b.daysAgo, 2, '2.9 days ago floors to 2');
});

test('parseStashBranches: parses the "WIP on <branch>:" format', () => {
  const raw = [
    'stash@{0}: WIP on feature-x: 1a2b3c4 commit message',
    'stash@{1}: WIP on bugfix-y: 9z8y7x6 another message',
  ].join('\n');

  assert.deepEqual(parseStashBranches(raw), ['feature-x', 'bugfix-y']);
});

test('parseStashBranches: parses the "On <branch>:" (custom message) format', () => {
  const raw = 'stash@{0}: On release: my custom stash label';
  assert.deepEqual(parseStashBranches(raw), ['release']);
});

test('parseStashBranches: de-duplicates branches with multiple stashes', () => {
  const raw = [
    'stash@{0}: WIP on feature-x: aaa first',
    'stash@{1}: WIP on feature-x: bbb second',
    'stash@{2}: On feature-x: ccc third',
  ].join('\n');

  assert.deepEqual(parseStashBranches(raw), ['feature-x']);
});

test('parseStashBranches: handles branch names with slashes', () => {
  const raw = 'stash@{0}: WIP on feature/login: 123abc work in progress';
  assert.deepEqual(parseStashBranches(raw), ['feature/login']);
});

test('parseStashBranches: empty or unmatched output yields an empty array', () => {
  assert.deepEqual(parseStashBranches(''), []);
  assert.deepEqual(parseStashBranches('not a stash line\n'), []);
});

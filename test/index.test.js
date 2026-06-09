import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyReason } from '../src/index.js';

test('friendlyReason: maps an unmerged-branch error to actionable advice', () => {
  // Mirrors the real simple-git message: "The branch 'x' is not fully merged."
  const err = new Error("error: The branch 'feature' is not fully merged.");
  assert.match(friendlyReason(err), /not fully merged/);
  assert.match(friendlyReason(err), /--force/);
});

test('friendlyReason: maps a checked-out error', () => {
  const err = new Error("error: Cannot delete branch 'x' checked out at '/repo'");
  assert.equal(friendlyReason(err), 'currently checked out');
});

test('friendlyReason: falls back to a generic message for unknown errors', () => {
  assert.equal(friendlyReason(new Error('some other git failure')), 'deletion failed');
});

test('friendlyReason: tolerates non-Error values', () => {
  assert.equal(friendlyReason('a string failure'), 'deletion failed');
  assert.equal(friendlyReason(null), 'deletion failed');
});

test('friendlyReason: never leaks multi-line raw git output', () => {
  const err = new Error('line one\nline two\nline three');
  const reason = friendlyReason(err);
  assert.ok(!reason.includes('\n'), 'reason must be a single line');
});

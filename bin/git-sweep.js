#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { run } from '../src/index.js';

const program = new Command();

const toList = (value) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const toInt = (value) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || String(n) !== value.trim()) {
    throw new InvalidArgumentError('must be a non-negative integer.');
  }
  return n;
};

program
  .name('git-sweep')
  .description('Clean up stale local Git branches — safely and interactively.')
  .option('--dry-run', 'list candidate branches without deleting anything')
  .option('--force', 'skip confirmation and force-delete all candidate branches (git -D)')
  .option('--weeks <n>', 'inactivity threshold in weeks', toInt, 3)
  .option('--protect <names>', 'comma-separated extra protected branch names', toList, [])
  .option('--base <branch>', 'base branch to check merges/gone against (auto-detected by default)')
  .parse(process.argv);

run(program.opts()).catch((err) => {
  // Last-resort guard: keep output clean, never dump a raw stack on the user.
  console.error(err?.message ?? String(err));
  process.exitCode = 1;
});

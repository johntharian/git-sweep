// All human-facing output and prompts. Nothing else in the app prints directly,
// so the look-and-feel lives in one place.
import chalk from 'chalk';
import inquirer from 'inquirer';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A consistent "name (last commit: X days ago)" label for a branch. */
function branchLine(b) {
  const ago = `${b.daysAgo} day${b.daysAgo === 1 ? '' : 's'} ago`;
  return `${b.name}  ${chalk.gray(`(last commit: ${ago})`)}`;
}

export function error(message) {
  console.error(`${chalk.red('✖')} ${chalk.red(message)}`);
}

export function info(message) {
  console.log(`${chalk.gray('•')} ${message}`);
}

export function allClean(weeks) {
  console.log(
    chalk.green(
      `\nAll clean! 🎉  No branches have been idle for ${plural(weeks, 'week')} or more.\n`
    )
  );
}

/** dry-run / preview report — describes intent, deletes nothing. */
export function dryRunReport({ deletable, stashSkipped, protectedOrCurrent, weeks }) {
  console.log(
    chalk.bold(
      `\nDry run — stale threshold: ${plural(weeks, 'week')}. Nothing will be deleted.\n`
    )
  );

  if (deletable.length) {
    console.log(chalk.red.bold(`Would delete (${deletable.length}):`));
    for (const b of deletable) console.log(`  ${chalk.red('🔴')} ${branchLine(b)}`);
  } else {
    console.log(chalk.gray('No branches are eligible for deletion.'));
  }

  if (stashSkipped.length) {
    console.log(chalk.yellow.bold(`\nSkipped — stash found (${stashSkipped.length}):`));
    for (const b of stashSkipped) {
      console.log(`  ${chalk.yellow('🟡')} ${branchLine(b)} ${chalk.yellow('[has stash]')}`);
    }
  }

  if (protectedOrCurrent.length) {
    console.log(chalk.gray.bold(`\nProtected / current (${protectedOrCurrent.length}):`));
    for (const b of protectedOrCurrent) console.log(`  ${protectedLabel(b)}`);
  }

  console.log();
}

function protectedLabel(b) {
  const reason = b.isCurrent ? 'current' : 'protected';
  return chalk.gray(`⚪ ${b.name} (${reason})`);
}

/**
 * Interactive multi-select checklist. Deletable branches are pre-checked;
 * stashed branches are shown but disabled so they can't be selected.
 *
 * @returns {Promise<string[]>} branch names the user chose to delete.
 */
export async function promptSelection(deletable, stashSkipped) {
  const choices = [];

  for (const b of deletable) {
    choices.push({ name: branchLine(b), value: b.name, checked: true });
  }
  for (const b of stashSkipped) {
    choices.push({
      name: branchLine(b),
      value: b.name,
      disabled: chalk.yellow('[has stash — skipped]'),
    });
  }

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select stale branches to delete:',
      choices,
      pageSize: 20,
    },
  ]);

  return selected;
}

/** Final yes/no gate before anything is deleted. */
export async function confirmDeletion(selected) {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: `Delete ${plural(selected.length, 'branch')}? This cannot be undone.`,
      default: false,
    },
  ]);
  return confirmed;
}

export function reportDeleted(name) {
  console.log(`  ${chalk.red('🔴 deleted')}  ${name}`);
}

export function reportFailed(name, reason) {
  console.log(`  ${chalk.yellow('⚠  kept')}    ${name} ${chalk.gray(`— ${reason}`)}`);
}

/** Closing summary of everything that happened. */
export function summary({ deleted, failed, stashSkipped, protectedOrCurrent }) {
  console.log(chalk.green.bold('\n── Summary ──────────────────────────'));

  console.log(chalk.green(`🟢 Deleted: ${deleted.length}`));
  for (const name of deleted) console.log(`   ${chalk.red('🔴')} ${name}`);

  if (failed.length) {
    console.log(chalk.yellow(`⚠  Kept (delete failed): ${failed.length}`));
    for (const f of failed) {
      console.log(`   ${chalk.yellow('🟡')} ${f.name} ${chalk.gray(`— ${f.reason}`)}`);
    }
  }

  if (stashSkipped.length) {
    console.log(chalk.yellow(`🟡 Skipped — stash found: ${stashSkipped.length}`));
    for (const b of stashSkipped) console.log(`   ${chalk.yellow('🟡')} ${b.name}`);
  }

  if (protectedOrCurrent.length) {
    console.log(chalk.gray(`⚪ Skipped — protected/current: ${protectedOrCurrent.length}`));
    for (const b of protectedOrCurrent) console.log(`   ${protectedLabel(b)}`);
  }

  console.log();
}

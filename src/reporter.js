/**
 * @file reporter.js
 * @description Formats and prints check results to stdout using chalk.
 *
 * All output follows the prefix convention:
 *   [ DOTENV-CHECKER ] [ LEVEL ] message
 *
 * Status tags used in reports:
 *   [ MISSING ] Key expected by .env.example but absent from .env
 *   [ EMPTY ]   Key present in .env but with no value
 *   [ EXTRA ]   Key in .env but not documented in .env.example
 *   [ OK ]      Key present and has a value
 *   [ ONLY-A ]  Key exists only in file A (compare mode)
 *   [ ONLY-B ]  Key exists only in file B (compare mode)
 *   [ SHARED ]  Key exists in both files (compare mode, verbose only)
 *
 * @module reporter
 */

import chalk from 'chalk';

/** Shared prefix printed on every output line. */
const PREFIX = chalk.blue.bold('[ DOTENV-CHECKER ]');

/** Horizontal divider line. */
const DIVIDER = chalk.dim('  ' + '─'.repeat(50));

// ---------------------------------------------------------------------------
// Status tag builders
// ---------------------------------------------------------------------------

const tag = {
  MISSING: chalk.bold.red('[ MISSING ]'),
  EMPTY:   chalk.bold.yellow('[ EMPTY ]'),
  EXTRA:   chalk.bold.yellow('[ EXTRA ]'),
  OK:      chalk.bold.green('[ OK ]'),
  ONLY_A:  chalk.bold.yellow('[ ONLY-A ]'),
  ONLY_B:  chalk.bold.blue('[ ONLY-B ]'),
  SHARED:  chalk.bold.green('[ SHARED ]'),
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Prints a single result row with consistent alignment.
 *
 * @param {string} statusTag  - Pre-built chalk tag (e.g. tag.MISSING)
 * @param {string} key        - Variable name
 * @param {string} [hint=''] - Optional dim hint shown after the key
 */
function row(statusTag, key, hint = '') {
  const hintStr = hint ? chalk.dim(`  ${hint}`) : '';
  console.log(`    ${statusTag}  ${chalk.bold(key)}${hintStr}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Prints a full check report comparing a .env file against a .env.example file.
 *
 * @param  {import('./checker.js').CheckResults} results
 * @param  {Object}  options
 * @param  {boolean} [options.verbose=false]         - Also print OK keys
 * @param  {string}  [options.envFile='.env']         - Label for the env file
 * @param  {string}  [options.exampleFile='.env.example'] - Label for the reference file
 * @returns {number} Total number of issues found (missing + empty + extra)
 */
export function report(results, { verbose = false, envFile = '.env', exampleFile = '.env.example' } = {}) {
  const { missing, extra, empty, ok } = results;
  const totalIssues = missing.length + extra.length + empty.length;
  const total       = totalIssues + ok.length;

  console.log('');
  console.log(DIVIDER);
  console.log(`${PREFIX}  ${chalk.underline(envFile)}  ${chalk.dim('vs')}  ${chalk.underline(exampleFile)}`);
  console.log('');

  if (missing.length > 0) {
    console.log(`  ${chalk.bold.red('MISSING KEYS')}  ${chalk.dim('(in .env.example but not in .env)')}`);
    missing.forEach(({ key, exampleLine }) =>
      row(tag.MISSING, key, `expected at line ${exampleLine} of ${exampleFile}`)
    );
    console.log('');
  }

  if (empty.length > 0) {
    console.log(`  ${chalk.bold.yellow('EMPTY KEYS')}  ${chalk.dim('(defined but no value set)')}`);
    empty.forEach(({ key, envLine }) =>
      row(tag.EMPTY, key, `line ${envLine} in ${envFile}`)
    );
    console.log('');
  }

  if (extra.length > 0) {
    console.log(`  ${chalk.bold.yellow('EXTRA KEYS')}  ${chalk.dim('(in .env but not in .env.example)')}`);
    extra.forEach(({ key, envLine }) =>
      row(tag.EXTRA, key, `line ${envLine} in ${envFile}`)
    );
    console.log('');
  }

  if (verbose && ok.length > 0) {
    console.log(`  ${chalk.bold.green('VALID KEYS')}`);
    ok.forEach(({ key }) => row(tag.OK, key));
    console.log('');
  }

  //console.log(DIVIDER);

  if (totalIssues === 0) {
    console.log(`  ${chalk.bold.green('[ OK ]')}  ${total} variable${total !== 1 ? 's' : ''} checked. All good.`);
  } else {
    const parts = [
      missing.length && chalk.red(`${missing.length} missing`),
      empty.length   && chalk.yellow(`${empty.length} empty`),
      extra.length   && chalk.yellow(`${extra.length} extra`),
    ].filter(Boolean).join(chalk.dim('  /  '));

    console.log(`  ${chalk.bold.red('[ ERROR ]')}  ${parts}  ${chalk.dim(`(${ok.length}/${total} ok)`)}`);
  }

  console.log('');
  return totalIssues;
}

/**
 * Prints a symmetric diff report between two arbitrary .env files.
 * Used by the --compare mode. No notion of "reference" file here.
 *
 * @param  {Map}     entriesA
 * @param  {Map}     entriesB
 * @param  {Object}  options
 * @param  {string}  options.fileA
 * @param  {string}  options.fileB
 * @param  {boolean} [options.verbose=false]
 * @returns {number} Number of keys that differ between the two files
 */
export function reportCompare(entriesA, entriesB, { fileA, fileB, verbose = false } = {}) {
  const onlyA   = [];
  const onlyB   = [];
  const shared  = [];
  const allKeys = new Set([...entriesA.keys(), ...entriesB.keys()]);

  for (const key of allKeys) {
    if (entriesA.has(key) && entriesB.has(key)) shared.push(key);
    else if (entriesA.has(key))                  onlyA.push(key);
    else                                          onlyB.push(key);
  }

  const nameA = fileA.split('/').pop();
  const nameB = fileB.split('/').pop();

  console.log('');
  console.log(DIVIDER);
  console.log(`${PREFIX}  ${chalk.dim('compare')}  ${chalk.underline(nameA)}  ${chalk.dim('vs')}  ${chalk.underline(nameB)}`);
  console.log('');

  if (onlyA.length > 0) {
    console.log(`  ${chalk.bold.yellow(`ONLY IN ${nameA}`)}`);
    onlyA.forEach(key => {
      const hint = entriesA.get(key).hasValue ? '' : 'empty value';
      row(tag.ONLY_A, key, hint);
    });
    console.log('');
  }

  if (onlyB.length > 0) {
    console.log(`  ${chalk.bold.blue(`ONLY IN ${nameB}`)}`);
    onlyB.forEach(key => {
      const hint = entriesB.get(key).hasValue ? '' : 'empty value';
      row(tag.ONLY_B, key, hint);
    });
    console.log('');
  }

  if (verbose && shared.length > 0) {
    console.log(`  ${chalk.bold.green('SHARED KEYS')}`);
    shared.forEach(key => row(tag.SHARED, key));
    console.log('');
  }

  const issues = onlyA.length + onlyB.length;
  //console.log(DIVIDER);

  if (issues === 0) {
    console.log(`  ${chalk.bold.green('[ OK ]')}  Files are in sync. ${shared.length} shared variable${shared.length !== 1 ? 's' : ''}.`);
  } else {
    const parts = [
      onlyA.length && chalk.yellow(`${onlyA.length} only in ${nameA}`),
      onlyB.length && chalk.blue(`${onlyB.length} only in ${nameB}`),
    ].filter(Boolean).join(chalk.dim('  /  '));

    console.log(`  ${chalk.bold.yellow('[ WARN ]')}  ${parts}  ${chalk.dim(`(${shared.length} shared)`)}`);
  }

  console.log('');
  return issues;
}

/**
 * Prints a global summary after a full project scan.
 * Only shown when more than one .env file was checked.
 *
 * @param {Array<{ file: string, issues: number }>} allResults
 */
export function reportScanSummary(allResults) {
  const total  = allResults.length;
  const clean  = allResults.filter(r => r.issues === 0).length;
  const failed = total - clean;

  console.log('  ' + '═'.repeat(52));
  console.log(`  ${chalk.bold('SCAN COMPLETE')}  ${chalk.dim(`${total} file${total !== 1 ? 's' : ''} checked`)}`);
  console.log('');

  if (failed === 0) {
    console.log(`  ${chalk.bold.green('[ OK ]')}  All files are clean.`);
  } else {
    console.log(`  ${chalk.bold.red('[ ERROR ]')}  ${chalk.red(`${failed} file${failed !== 1 ? 's' : ''} with issues`)}  ${chalk.dim(`/  ${clean} clean`)}`);
  }

  console.log('');
}

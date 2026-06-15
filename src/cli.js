#!/usr/bin/env node

/**
 * @file cli.js
 * @description Entry point of the dotenv-checker CLI.
 *
 * Responsible for:
 *  - Parsing command-line arguments (flags and options)
 *  - Selecting the correct execution mode based on provided arguments
 *  - Delegating file reading, comparison and output to dedicated modules
 *
 * Three execution modes are available:
 *
 *  1. SCAN MODE (default)
 *     Recursively scans the project directory for every .env* file,
 *     pairs each one with its matching reference file (.env.example,
 *     .env.template, .env.sample…), and runs a check on each pair.
 *     A global summary is printed at the end when multiple files are found.
 *
 *  2. EXPLICIT MODE  --env <path> --example <path>
 *     Checks a single, explicitly specified pair of files.
 *     Useful when files are not at the project root or have non-standard names.
 *
 *  3. COMPARE MODE  --compare <fileA> <fileB>
 *     Performs a symmetric diff between two arbitrary .env files.
 *     No reference file (.env.example) is required.
 *     Useful for comparing environments: staging vs production, branch A vs branch B.
 *
 * Exit codes:
 *  0  All checks passed — no issues detected
 *  1  One or more issues were detected (missing, empty or extra keys)
 *  2  A required file was not found or arguments are invalid
 *
 * @module cli
 */

import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

import { parseEnvFile }                              from './parser.js';
import { check }                                     from './checker.js';
import { report, reportCompare, reportScanSummary }  from './reporter.js';
import { scanProject, findMatchingReference }         from './scanner.js';

// ---------------------------------------------------------------------------
// ESM-compatible __dirname (not available natively in ESM modules)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

/**
 * Prints a formatted prefix block used consistently across all CLI output.
 *
 * Format:  [ DOTENV-CHECKER ] [ LEVEL ] message
 *
 * @param {'ERROR'|'WARN'|'INFO'} level   - Severity level of the message
 * @param {string}                message - Human-readable message to display
 */
function log(level, message) {
  const prefix = chalk.bold('[ DOTENV-CHECKER ]');

  const tag = {
    ERROR: chalk.bold.red('[ ERROR ]'),
    WARN:  chalk.bold.yellow('[ WARN ]'),
    INFO:  chalk.bold.cyan('[ INFO ]'),
  }[level] ?? chalk.bold('[ LOG ]');

  console.log(`${prefix} ${tag} ${message}`);
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/**
 * Raw argument list, excluding the Node.js binary and script path.
 * @type {string[]}
 */
const args = process.argv.slice(2);

/**
 * Returns true if the given flag is present in the argument list.
 *
 * @param  {string}  flag - Flag to look for (e.g. '--verbose')
 * @returns {boolean}
 */
function getFlag(flag) {
  return args.includes(flag);
}

/**
 * Returns the value immediately following the given option flag.
 * Returns null if the flag is absent or has no following value.
 *
 * @param  {string}      option - Option flag (e.g. '--env')
 * @returns {string|null}
 */
function getOption(option) {
  const index = args.indexOf(option);
  return index !== -1 ? args[index + 1] ?? null : null;
}

// ---------------------------------------------------------------------------
// Help screen
// ---------------------------------------------------------------------------

if (getFlag('--help') || getFlag('-h')) {
  console.log(`
  ${chalk.bold.cyan('[ DOTENV-CHECKER ]')}  ${chalk.dim('v0.1.0')}

  ${chalk.bold('USAGE')}

    dotenv-checker ${chalk.dim('[options]')}

  ${chalk.bold('MODES')}

    ${chalk.bold('(default)')}               Scan the whole project for .env files
    ${chalk.bold('--env / --example')}       Check a specific pair of files
    ${chalk.bold('--compare <A> <B>')}       Compare two .env files directly

  ${chalk.bold('OPTIONS')}

    ${chalk.bold('--env')}      <path>       Path to your .env file            ${chalk.dim('(default: .env)')}
    ${chalk.bold('--example')}  <path>       Path to your .env.example file    ${chalk.dim('(default: .env.example)')}
    ${chalk.bold('--compare')}  <A> <B>      Compare two env files side by side
    ${chalk.bold('--dir')}      <path>       Root directory to scan            ${chalk.dim('(default: current dir)')}
    ${chalk.bold('--verbose')}, ${chalk.bold('-v')}          Also show valid / shared variables
    ${chalk.bold('--help')},    ${chalk.bold('-h')}          Show this help

  ${chalk.bold('EXIT CODES')}

    ${chalk.bold('0')}   No issues found
    ${chalk.bold('1')}   One or more issues detected
    ${chalk.bold('2')}   File not found or invalid arguments

  ${chalk.bold('EXAMPLES')}

    ${chalk.dim('# Scan the entire project')}
    dotenv-checker

    ${chalk.dim('# Scan a specific subfolder')}
    dotenv-checker --dir ./backend

    ${chalk.dim('# Check a specific pair')}
    dotenv-checker --env .env.local --example .env.example

    ${chalk.dim('# Compare two environments')}
    dotenv-checker --compare .env.staging .env.production
  `);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Shared option: --verbose
// ---------------------------------------------------------------------------

/** @type {boolean} When true, valid/shared keys are also printed in the report. */
const verbose = getFlag('--verbose') || getFlag('-v');

// ---------------------------------------------------------------------------
// MODE 1 — COMPARE  --compare <fileA> <fileB>
// ---------------------------------------------------------------------------

const compareIndex = args.indexOf('--compare');

if (compareIndex !== -1) {
  const rawA = args[compareIndex + 1];
  const rawB = args[compareIndex + 2];

  // Validate that both arguments are present and are not other flags
  if (!rawA || !rawB || rawA.startsWith('--') || rawB.startsWith('--')) {
    log('ERROR', '--compare requires two file paths:  --compare <fileA> <fileB>');
    process.exit(2);
  }

  const pathA = path.resolve(process.cwd(), rawA);
  const pathB = path.resolve(process.cwd(), rawB);

  const entriesA = parseEnvFile(pathA);
  const entriesB = parseEnvFile(pathB);

  if (!entriesA) {
    log('ERROR', `File not found: ${chalk.underline(pathA)}`);
    process.exit(2);
  }

  if (!entriesB) {
    log('ERROR', `File not found: ${chalk.underline(pathB)}`);
    process.exit(2);
  }

  const issues = reportCompare(entriesA, entriesB, { fileA: pathA, fileB: pathB, verbose });
  process.exit(issues > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// MODE 2 — EXPLICIT  --env <path> --example <path>
// ---------------------------------------------------------------------------

const explicitEnv     = getOption('--env');
const explicitExample = getOption('--example');

if (explicitEnv || explicitExample) {
  const envFile     = explicitEnv     ?? '.env';
  const exampleFile = explicitExample ?? '.env.example';

  const envPath     = path.resolve(process.cwd(), envFile);
  const examplePath = path.resolve(process.cwd(), exampleFile);

  const envEntries     = parseEnvFile(envPath);
  const exampleEntries = parseEnvFile(examplePath);

  if (!envEntries) {
    log('ERROR', `File not found: ${chalk.underline(envPath)}`);
    process.exit(2);
  }

  if (!exampleEntries) {
    log('ERROR', `File not found: ${chalk.underline(examplePath)}`);
    process.exit(2);
  }

  const results = check(envEntries, exampleEntries);
  const issues  = report(results, { verbose, envFile, exampleFile });
  process.exit(issues > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// MODE 3 — SCAN (default)
// ---------------------------------------------------------------------------

const rootDir = path.resolve(process.cwd(), getOption('--dir') ?? '.');

const { envFiles, referenceFiles } = scanProject(rootDir);

// Nothing to check
if (envFiles.length === 0 && referenceFiles.length === 0) {
  log('INFO', 'No .env files found in this directory.');
  process.exit(0);
}

/** @type {Array<{ file: string, issues: number }>} */
const allResults = [];

/** @type {number} Running total of issues across all checked files. */
let totalIssues = 0;

// -- Check each .env file against its matching reference -------------------

for (const envFilePath of envFiles) {
  const referenceFilePath = findMatchingReference(envFilePath, referenceFiles);
  const relativeEnvPath   = path.relative(rootDir, envFilePath);

  if (!referenceFilePath) {
    log('WARN', `${chalk.underline(relativeEnvPath)}  —  no .env.example found, skipped.`);
    continue;
  }

  const relativeRefPath = path.relative(rootDir, referenceFilePath);
  const envEntries      = parseEnvFile(envFilePath);
  const refEntries      = parseEnvFile(referenceFilePath);

  const results = check(envEntries, refEntries);
  const issues  = report(results, {
    verbose,
    envFile:     relativeEnvPath,
    exampleFile: relativeRefPath,
  });

  totalIssues += issues;
  allResults.push({ file: relativeEnvPath, issues });
}

// -- Mention reference files that have no matching .env --------------------

for (const refPath of referenceFiles) {
  const refDir   = path.dirname(refPath);
  const hasMatch = envFiles.some(f => path.dirname(f) === refDir);

  if (!hasMatch) {
    const relRef = path.relative(rootDir, refPath);
    log('WARN', `${chalk.underline(relRef)}  —  reference file with no matching .env.`);
  }
}

// -- Global summary (only relevant when more than one file was checked) ----

if (allResults.length > 1) {
  reportScanSummary(allResults);
}

process.exit(totalIssues > 0 ? 1 : 0);

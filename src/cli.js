#!/usr/bin/env node

/**
 * @file cli.js
 * @description Entry point of the dotenv-checker CLI.
 * @module cli
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

import { parseEnvFile }                                                     from './parser.js';
import { check }                                                            from './checker.js';
import { report, reportCompare, reportScanSummary, reportFix, reportJson }  from './reporter.js';
import { scanProject, findMatchingReference }                               from './scanner.js';
import { fixEnvFile, syncReferenceFile }                                    from './fixer.js';

/**
 * Raw command-line arguments excluding binary and script paths.
 * @type {string[]}
 */
const args = process.argv.slice(2);

const packageJsonPath = new URL('../package.json', import.meta.url);
const { version } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

/**
 * Checks if a specific flag is passed via CLI args or npm config environment.
 *
 * @param  {string}  flag - Flag identifier to search for
 * @returns {boolean} True if the flag is present
 */
function getFlag(flag) {
  const clean  = flag.replace(/^--?/, '').replace(/-/g, '_');
  const envKey = `npm_config_${clean}`;
  return args.some(arg => arg === flag || arg.startsWith(`${flag}=`)) || process.env[envKey] === 'true';
}

/**
 * Retrieves the value of an option passed as `--key value`, `--key=value`, or npm config.
 *
 * @param  {string}      option - Option identifier to look up
 * @returns {string|null} Resolved option value or null if not provided
 */
function getOption(option) {
  const clean  = option.replace(/^--?/, '').replace(/-/g, '_');
  const envKey = `npm_config_${clean}`;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === option) {
      const next = args[i + 1];
      return (next && !next.startsWith('--')) ? next : null;
    }
    if (arg.startsWith(`${option}=`)) {
      return arg.slice(option.length + 1);
    }
  }
  return process.env[envKey] ?? null;
}

/**
 * Prints a prefixed log message to standard output.
 *
 * @param {'ERROR'|'WARN'|'INFO'} level   - Severity of the message
 * @param {string}                message - Human-readable text
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

if (getFlag('--version') || getFlag('-V')) {
  console.log(`v${version}`);
  process.exit(0);
}

if (getFlag('--help') || getFlag('-h')) {
  console.log(`
  ${chalk.bold.cyan('[ DOTENV-CHECKER ]')}  ${chalk.dim(`v${version}`)}

  ${chalk.bold('USAGE')}

    dotenv-checker ${chalk.dim('[options]')}

  ${chalk.bold('MODES')}

    ${chalk.bold('(default)')}               Scan workspace recursively for .env files
    ${chalk.bold('--env / --example')}       Check a specific pair of files
    ${chalk.bold('--compare <A> <B>')}       Compare two .env files directly

  ${chalk.bold('OPTIONS')}

    ${chalk.bold('--env')}      <path>       Path to your .env file            ${chalk.dim('(default: .env)')}
    ${chalk.bold('--example')}  <path>       Path to your .env.example file    ${chalk.dim('(default: .env.example)')}
    ${chalk.bold('--compare')}  <A> <B>      Compare two env files side by side
    ${chalk.bold('--dir')}      <path>       Root directory to scan            ${chalk.dim('(default: current dir)')}
    ${chalk.bold('--fix')}                   Automatically synchronize all .env and template files
    ${chalk.bold('--dry-run')}               Simulate fixes without writing changes to disk
    ${chalk.bold('--backup')}                Create a .env.bak backup before modifying files
    ${chalk.bold('--json')}                  Output machine-readable JSON results
    ${chalk.bold('--verbose')}, ${chalk.bold('-v')}          Also show valid and shared variables
    ${chalk.bold('--version')}, ${chalk.bold('-V')}          Display version information
    ${chalk.bold('--help')},    ${chalk.bold('-h')}          Show this help

  ${chalk.bold('EXIT CODES')}

    ${chalk.bold('0')}   No issues found
    ${chalk.bold('1')}   One or more issues detected
    ${chalk.bold('2')}   File not found or invalid arguments

  ${chalk.bold('EXAMPLES')}

    ${chalk.dim('# Scan the entire project')}
    dotenv-checker

    ${chalk.dim('# Automatically synchronize all env files and templates')}
    dotenv-checker --fix

    ${chalk.dim('# Preview fixes with dry-run and create backup')}
    dotenv-checker --fix --dry-run
    dotenv-checker --fix --backup

    ${chalk.dim('# Output results as JSON for CI/CD pipelines')}
    dotenv-checker --json

    ${chalk.dim('# Compare staging and production environments')}
    dotenv-checker --compare .env.staging .env.production
  `);
  process.exit(0);
}

const verbose = getFlag('--verbose') || getFlag('-v');
const json    = getFlag('--json');
const fix     = getFlag('--fix');
const dryRun  = getFlag('--dry-run');
const backup  = getFlag('--backup');

/**
 * Execution Mode 1: Direct comparison between two specific .env files.
 */
const compareIndex = args.indexOf('--compare');

if (compareIndex !== -1) {
  if (fix && !json) {
    log('WARN', '--fix is not applicable in --compare mode (use explicit --env and --example to synchronize).');
  }

  const rawA = args[compareIndex + 1];
  const rawB = args[compareIndex + 2];

  if (!rawA || !rawB || rawA.startsWith('--') || rawB.startsWith('--')) {
    if (!json) log('ERROR', '--compare requires two file paths:  --compare <fileA> <fileB>');
    process.exit(2);
  }

  const pathA = path.resolve(process.cwd(), rawA);
  const pathB = path.resolve(process.cwd(), rawB);

  const entriesA = parseEnvFile(pathA);
  const entriesB = parseEnvFile(pathB);

  if (!entriesA) {
    if (!json) log('ERROR', `File not found: ${chalk.underline(pathA)}`);
    process.exit(2);
  }

  if (!entriesB) {
    if (!json) log('ERROR', `File not found: ${chalk.underline(pathB)}`);
    process.exit(2);
  }

  if (json) {
    const onlyA   = [];
    const onlyB   = [];
    const shared  = [];
    const allKeys = new Set([...entriesA.keys(), ...entriesB.keys()]);

    for (const key of allKeys) {
      if (entriesA.has(key) && entriesB.has(key)) shared.push(key);
      else if (entriesA.has(key))                  onlyA.push(key);
      else                                          onlyB.push(key);
    }

    reportJson({
      mode: 'compare',
      fileA: pathA,
      fileB: pathB,
      onlyA,
      onlyB,
      shared,
      issues: onlyA.length + onlyB.length,
    });
    process.exit(onlyA.length + onlyB.length > 0 ? 1 : 0);
  }

  const issues = reportCompare(entriesA, entriesB, { fileA: pathA, fileB: pathB, verbose });
  process.exit(issues > 0 ? 1 : 0);
}

/**
 * Execution Mode 2: Explicit pair check (--env <path> --example <path>).
 */
const explicitEnv     = getOption('--env');
const explicitExample = getOption('--example');

if (explicitEnv || explicitExample) {
  const envFile     = explicitEnv     ?? '.env';
  const exampleFile = explicitExample ?? '.env.example';

  const envPath     = path.resolve(process.cwd(), envFile);
  const examplePath = path.resolve(process.cwd(), exampleFile);

  let exampleEntries = parseEnvFile(examplePath);
  let envEntries     = parseEnvFile(envPath);

  if (!exampleEntries && !fs.existsSync(examplePath)) {
    if (fix && envEntries) {
      const syncRes = syncReferenceFile(examplePath, envEntries, { dryRun, backup });
      if (!json) reportFix(exampleFile, syncRes.addedKeys, true, { dryRun, backupCreated: syncRes.backupCreated });
      exampleEntries = parseEnvFile(examplePath);
    } else {
      if (!json) log('ERROR', `File not found: ${chalk.underline(examplePath)}`);
      process.exit(2);
    }
  }

  let fixReport = null;

  if (!envEntries) {
    if (fix && exampleEntries) {
      fixReport = fixEnvFile(envPath, examplePath, undefined, exampleEntries, { dryRun, backup });
      if (!json) reportFix(envFile, fixReport.addedKeys, true, { dryRun, backupCreated: fixReport.backupCreated });
      if (!dryRun) envEntries = parseEnvFile(envPath);
    } else {
      if (!json) log('ERROR', `File not found: ${chalk.underline(envPath)}`);
      process.exit(2);
    }
  }

  if (fix && envEntries && exampleEntries) {
    const checkBefore = check(envEntries, exampleEntries);

    if (checkBefore.extra.length > 0) {
      const syncRes = syncReferenceFile(examplePath, envEntries, { dryRun, backup });
      if (!json && syncRes.addedKeys.length > 0) {
        reportFix(exampleFile, syncRes.addedKeys, syncRes.created, { dryRun, backupCreated: syncRes.backupCreated });
      }
      if (!dryRun) exampleEntries = parseEnvFile(examplePath);
    }

    if (checkBefore.missing.length > 0) {
      fixReport = fixEnvFile(envPath, examplePath, checkBefore.missing, exampleEntries, { dryRun, backup });
      if (!json && fixReport.addedKeys.length > 0) {
        reportFix(envFile, fixReport.addedKeys, false, { dryRun, backupCreated: fixReport.backupCreated });
      }
      if (!dryRun) envEntries = parseEnvFile(envPath);
    }
  }

  const results = (envEntries && exampleEntries)
    ? check(envEntries, exampleEntries)
    : { missing: [], extra: [], empty: [], ok: [] };

  if (json) {
    reportJson({
      mode: 'explicit',
      envFile,
      exampleFile,
      results,
      fix: fixReport,
      issues: results.missing.length + results.extra.length + results.empty.length,
    });
    process.exit(results.missing.length + results.extra.length + results.empty.length > 0 ? 1 : 0);
  }

  const issues = report(results, { verbose, envFile, exampleFile });
  process.exit(issues > 0 ? 1 : 0);
}

/**
 * Execution Mode 3: Automatic workspace scan with directory-level consistency.
 */
const rootDir = path.resolve(process.cwd(), getOption('--dir') ?? '.');

const { envFiles, referenceFiles } = scanProject(rootDir);

if (envFiles.length === 0 && referenceFiles.length === 0) {
  if (json) {
    reportJson({ mode: 'scan', files: [], summary: { total: 0, issues: 0 } });
  } else {
    log('INFO', 'No .env files found in this directory.');
  }
  process.exit(0);
}

// Group all discovered files by their directory
const dirMap = new Map();

for (const envPath of envFiles) {
  const dir = path.dirname(envPath);
  if (!dirMap.has(dir)) dirMap.set(dir, { envs: [], refs: [] });
  dirMap.get(dir).envs.push(envPath);
}

for (const refPath of referenceFiles) {
  const dir = path.dirname(refPath);
  if (!dirMap.has(dir)) dirMap.set(dir, { envs: [], refs: [] });
  dirMap.get(dir).refs.push(refPath);
}

const allResults = [];
let totalIssues = 0;

for (const [dir, group] of dirMap) {
  // Collect union of all keys defined across all files in this directory
  const allKnownKeys = new Map();

  for (const filePath of [...group.envs, ...group.refs]) {
    const parsed = parseEnvFile(filePath);
    if (parsed) {
      for (const [k, v] of parsed) {
        if (!allKnownKeys.has(k)) {
          allKnownKeys.set(k, v);
        }
      }
    }
  }

  // Identify or establish reference template file for this directory
  let primaryRefPath = group.refs[0] ?? null;

  if (!primaryRefPath && group.envs.length > 0) {
    primaryRefPath = path.join(dir, '.env.example');
  }

  // Synchronize reference template if it is missing keys present in environment files
  if (primaryRefPath && allKnownKeys.size > 0) {
    const refRelative = path.relative(rootDir, primaryRefPath);
    let refEntries    = parseEnvFile(primaryRefPath) ?? new Map();

    const missingInRef = Array.from(allKnownKeys.keys()).filter(k => !refEntries.has(k));

    if (missingInRef.length > 0) {
      if (fix) {
        const syncRes = syncReferenceFile(primaryRefPath, allKnownKeys, { dryRun, backup });
        if (!json && syncRes.addedKeys.length > 0) {
          reportFix(refRelative, syncRes.addedKeys, syncRes.created, { dryRun, backupCreated: syncRes.backupCreated });
        }
        if (!dryRun) {
          refEntries = parseEnvFile(primaryRefPath) ?? new Map();
          if (!group.refs.includes(primaryRefPath)) group.refs.push(primaryRefPath);
        }
      }
    }
  }

  // Effective reference entries: populated reference or union of all known keys in the directory
  let effectiveRefEntries = (primaryRefPath && fs.existsSync(primaryRefPath))
    ? (parseEnvFile(primaryRefPath) ?? new Map())
    : allKnownKeys;

  if (effectiveRefEntries.size === 0 && allKnownKeys.size > 0) {
    effectiveRefEntries = allKnownKeys;
  }

  // Check each environment file in this directory
  for (const envFilePath of group.envs) {
    const relativeEnvPath = path.relative(rootDir, envFilePath);
    const targetRefPath   = findMatchingReference(envFilePath, group.refs) ?? primaryRefPath;
    const relativeRefPath = targetRefPath ? path.relative(rootDir, targetRefPath) : '.env.example';

    let envEntries = parseEnvFile(envFilePath) ?? new Map();
    let refEntries = (targetRefPath && fs.existsSync(targetRefPath))
      ? (parseEnvFile(targetRefPath) ?? new Map())
      : effectiveRefEntries;

    if (refEntries.size === 0 && effectiveRefEntries.size > 0) {
      refEntries = effectiveRefEntries;
    }

    let results = check(envEntries, refEntries);

    if (fix && results.missing.length > 0 && targetRefPath) {
      const fixReport = fixEnvFile(envFilePath, targetRefPath, results.missing, refEntries, { dryRun, backup });
      if (!json && fixReport.addedKeys.length > 0) {
        reportFix(relativeEnvPath, fixReport.addedKeys, false, { dryRun, backupCreated: fixReport.backupCreated });
      }
      if (!dryRun) {
        envEntries = parseEnvFile(envFilePath) ?? new Map();
        results    = check(envEntries, refEntries);
      }
    }

    const issues = results.missing.length + results.extra.length + results.empty.length;
    totalIssues += issues;

    if (json) {
      allResults.push({
        file: relativeEnvPath,
        reference: relativeRefPath,
        results,
        issues,
      });
    } else {
      report(results, {
        verbose,
        envFile:     relativeEnvPath,
        exampleFile: relativeRefPath,
      });
      allResults.push({ file: relativeEnvPath, issues });
    }
  }
}

if (json) {
  reportJson({
    mode: 'scan',
    files: allResults,
    summary: {
      totalFiles: allResults.length,
      totalIssues,
      cleanFiles: allResults.filter(r => r.issues === 0).length,
      failedFiles: allResults.filter(r => r.issues > 0).length,
    },
  });
} else if (allResults.length > 1) {
  reportScanSummary(allResults);
}

process.exit(totalIssues > 0 ? 1 : 0);

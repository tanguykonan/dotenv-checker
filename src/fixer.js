/**
 * @file fixer.js
 * @description Automatically synchronizes missing environment variables into .env and reference files.
 * @module fixer
 */

import fs from 'fs';
import path from 'path';
import { parseEnvFile } from './parser.js';

/**
 * @typedef {Object} FixOptions
 * @property {boolean} [dryRun=false] - When true, simulates fixes without writing to disk
 * @property {boolean} [backup=false] - When true, creates a .env.bak backup before modifying
 */

/**
 * @typedef {Object} FixResult
 * @property {string[]} addedKeys     - Array of variable keys added to the file
 * @property {boolean}  created       - True if the destination file was newly created
 * @property {string}   targetPath    - Resolved path to the fixed environment file
 * @property {boolean}  dryRun        - True if the operation was simulated
 * @property {boolean}  backupCreated - True if a backup file was generated
 */

/**
 * Synchronizes missing keys into a target .env file using definitions from a reference file.
 * Non-destructive: existing keys, comments, and empty values are strictly preserved.
 *
 * @param  {string}                                                 envPath        - Path to the destination .env file
 * @param  {string}                                                 examplePath    - Path to the reference (.env.example) file
 * @param  {Array<{key: string, exampleLine?: number}>}             [missingKeys]  - List of missing key objects
 * @param  {Map<string, import('./parser.js').EnvEntry>}            [exampleEntries] - Parsed reference entries
 * @param  {FixOptions}                                             [options]      - Execution options
 * @returns {FixResult} Summary of the fix operation
 */
export function fixEnvFile(
  envPath,
  examplePath,
  missingKeys = [],
  exampleEntries = new Map(),
  { dryRun = false, backup = false } = {}
) {
  const resolvedEnv     = path.resolve(envPath);
  const resolvedExample = path.resolve(examplePath);

  if (!fs.existsSync(resolvedEnv)) {
    if (fs.existsSync(resolvedExample)) {
      const templateContent = fs.readFileSync(resolvedExample, 'utf-8');
      if (!dryRun) {
        fs.writeFileSync(resolvedEnv, templateContent, 'utf-8');
      }
      return {
        addedKeys: Array.from(exampleEntries.keys()),
        created: true,
        targetPath: resolvedEnv,
        dryRun,
        backupCreated: false,
      };
    }

    if (!dryRun) {
      fs.writeFileSync(resolvedEnv, '', 'utf-8');
    }
    return {
      addedKeys: [],
      created: true,
      targetPath: resolvedEnv,
      dryRun,
      backupCreated: false,
    };
  }

  const keysToAdd = missingKeys.map(item => (typeof item === 'string' ? item : item.key));
  if (keysToAdd.length === 0) {
    return {
      addedKeys: [],
      created: false,
      targetPath: resolvedEnv,
      dryRun,
      backupCreated: false,
    };
  }

  const existingContent = fs.readFileSync(resolvedEnv, 'utf-8');
  const trimmedExisting = existingContent.trimEnd();

  const newLines = keysToAdd.map(key => {
    const entry = exampleEntries.get(key);
    const rawValue = entry?.value ?? '';
    const formattedValue = (rawValue.includes(' ') || rawValue.includes('\t')) ? `"${rawValue}"` : rawValue;
    return `${key}=${formattedValue}`;
  });

  const header = '# --- Added by dotenv-checker --fix ---';
  const blockToAppend = `${header}\n${newLines.join('\n')}\n`;

  const finalContent = trimmedExisting.length > 0
    ? `${trimmedExisting}\n\n${blockToAppend}`
    : blockToAppend;

  let backupCreated = false;
  if (!dryRun) {
    if (backup) {
      fs.writeFileSync(`${resolvedEnv}.bak`, existingContent, 'utf-8');
      backupCreated = true;
    }
    fs.writeFileSync(resolvedEnv, finalContent, 'utf-8');
  }

  return {
    addedKeys: keysToAdd,
    created: false,
    targetPath: resolvedEnv,
    dryRun,
    backupCreated,
  };
}

/**
 * Synchronizes undocumented keys from environment files into a reference template (.env.example).
 * Keys are added with empty values (KEY=) to strictly prevent exposing secrets in templates.
 *
 * @param  {string}                                      referencePath - Path to the template file
 * @param  {Map<string, import('./parser.js').EnvEntry>} knownEntries  - Map of all known keys across env files
 * @param  {FixOptions}                                  [options]     - Execution options
 * @returns {FixResult} Summary of the synchronization operation
 */
export function syncReferenceFile(
  referencePath,
  knownEntries,
  { dryRun = false, backup = false } = {}
) {
  const resolvedRef = path.resolve(referencePath);
  const exists      = fs.existsSync(resolvedRef);
  const refEntries  = exists ? (parseEnvFile(resolvedRef) ?? new Map()) : new Map();

  const missingKeys = [];
  for (const key of knownEntries.keys()) {
    if (!refEntries.has(key)) {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length === 0 && exists) {
    return {
      addedKeys: [],
      created: false,
      targetPath: resolvedRef,
      dryRun,
      backupCreated: false,
    };
  }

  const existingContent = exists ? fs.readFileSync(resolvedRef, 'utf-8') : '';
  const trimmedExisting = existingContent.trimEnd();

  const newLines = missingKeys.map(key => `${key}=`);
  const header   = '# --- Documented by dotenv-checker --fix ---';
  const block    = `${header}\n${newLines.join('\n')}\n`;

  const finalContent = trimmedExisting.length > 0
    ? `${trimmedExisting}\n\n${block}`
    : block;

  let backupCreated = false;
  if (!dryRun) {
    if (backup && exists) {
      fs.writeFileSync(`${resolvedRef}.bak`, existingContent, 'utf-8');
      backupCreated = true;
    }
    fs.writeFileSync(resolvedRef, finalContent, 'utf-8');
  }

  return {
    addedKeys: missingKeys,
    created: !exists,
    targetPath: resolvedRef,
    dryRun,
    backupCreated,
  };
}

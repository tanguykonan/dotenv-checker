/**
 * @file scanner.js
 * @description Recursively scans a directory tree to find all .env* files.
 * @module scanner
 */

import fs   from 'fs';
import path from 'path';

/** Directories that are always excluded from the scan. */
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build',
  '.next', '.nuxt', 'coverage', '.cache',
]);

/** Patterns that identify a file as a reference/template (not a real env file). */
const REFERENCE_PATTERNS = [
  /\.env\.example$/,
  /\.env\.template$/,
  /\.env\.sample$/,
  /\.env\.defaults?$/,
];

/**
 * Returns true if the filename matches a reference pattern.
 * @param  {string}  filename
 * @returns {boolean}
 */
function isReference(filename) {
  return REFERENCE_PATTERNS.some(p => p.test(filename));
}

/**
 * Returns true if the filename is a .env* file (real or reference).
 * @param  {string}  filename
 * @returns {boolean}
 */
function isEnvFile(filename) {
  return /^\.env(\..+)?$/.test(filename);
}

/**
 * Recursively walks a directory and collects all .env* files,
 * split into real env files and reference files.
 *
 * @param  {string} rootDir  - Absolute path to the root directory
 * @param  {number} maxDepth - Maximum recursion depth (default: 4)
 * @returns {{ envFiles: string[], referenceFiles: string[] }}
 */
export function scanProject(rootDir, maxDepth = 4) {
  const envFiles       = [];
  const referenceFiles = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile() && isEnvFile(entry.name)) {
        const fullPath = path.join(dir, entry.name);
        isReference(entry.name) ? referenceFiles.push(fullPath) : envFiles.push(fullPath);
      }
    }
  }

  walk(rootDir, 0);
  return { envFiles, referenceFiles };
}

/**
 * For a given .env file, finds the best matching reference file in the same directory.
 * Tries specific matches first (e.g. .env.local.example), then falls back to .env.example.
 *
 * @param  {string}   envFilePath    - Absolute path to the .env file
 * @param  {string[]} referenceFiles - List of known reference file paths
 * @returns {string|null} Path to the matching reference file, or null if none found
 */
export function findMatchingReference(envFilePath, referenceFiles) {
  const dir      = path.dirname(envFilePath);
  const filename = path.basename(envFilePath);

  const candidates = [
    path.join(dir, `${filename}.example`),
    path.join(dir, `${filename}.template`),
    path.join(dir, `${filename}.sample`),
    path.join(dir, '.env.example'),
    path.join(dir, '.env.template'),
    path.join(dir, '.env.sample'),
  ];

  return candidates.find(c => referenceFiles.includes(c)) ?? null;
}

/**
 * @file parser.js
 * @description Reads and parses a .env file into a structured Map.
 * @module parser
 */

import fs from 'fs';

/**
 * @typedef {Object} EnvEntry
 * @property {string}  value    - The parsed value (empty string if not set)
 * @property {number}  line     - 1-based line number in the source file
 * @property {boolean} hasValue - True if the value is a non-empty string
 */

/**
 * Parses a .env file and returns a Map of key -> EnvEntry.
 * Supports: KEY=VALUE, KEY="VALUE WITH SPACES", KEY= (empty), # comments, blank lines.
 *
 * @param  {string} filePath - Absolute path to the .env file
 * @returns {Map<string, EnvEntry>|null} Parsed entries, or null if file does not exist
 */
export function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const lines   = fs.readFileSync(filePath, 'utf-8').split('\n');
  const entries = new Map();

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) return;

    const key = line.slice(0, eqIndex).trim();
    if (!key) return;

    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries.set(key, { value, line: index + 1, hasValue: value.length > 0 });
  });

  return entries;
}

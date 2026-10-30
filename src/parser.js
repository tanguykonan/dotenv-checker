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
 * Extracts and sanitizes the variable value, handling quotes and inline comments.
 *
 * @param  {string} rawValue - Raw string to the right of the equals sign
 * @returns {string} Sanitized variable value
 */
function parseValue(rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';

  const firstChar = trimmed[0];
  if (firstChar === '"' || firstChar === "'") {
    const closingIndex = trimmed.indexOf(firstChar, 1);
    if (closingIndex !== -1) {
      return trimmed.slice(1, closingIndex);
    }
  }

  const commentIndex = trimmed.indexOf('#');
  if (commentIndex !== -1) {
    return trimmed.slice(0, commentIndex).trim();
  }

  return trimmed;
}

/**
 * Parses a .env file and returns a Map of key -> EnvEntry.
 * Supports: KEY=VALUE, export KEY=VALUE, quoted values, inline comments (#), and empty values.
 *
 * @param  {string} filePath - Absolute path to the .env file
 * @returns {Map<string, EnvEntry>|null} Parsed entries, or null if file does not exist
 */
export function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const lines   = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  const entries = new Map();

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) return;

    let key = line.slice(0, eqIndex).trim();
    if (key.startsWith('export ')) {
      key = key.slice(7).trim();
    }

    if (!key) return;

    const rawValue = line.slice(eqIndex + 1);
    const value = parseValue(rawValue);

    entries.set(key, { value, line: index + 1, hasValue: value.length > 0 });
  });

  return entries;
}

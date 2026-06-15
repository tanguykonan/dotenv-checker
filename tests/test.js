/**
 * @file test.js
 * @description Test suite for parser.js and checker.js.
 *
 * Run with:
 *   node tests/test.js
 *
 * Exit codes:
 *   0  All tests passed
 *   1  One or more tests failed
 */

import { parseEnvFile } from '../src/parser.js';
import { check }        from '../src/checker.js';
import { writeFileSync } from 'fs';
import { join }          from 'path';
import { tmpdir }        from 'os';

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Logs a pass or fail result and updates the counters.
 *
 * @param {boolean} condition
 * @param {string}  message
 */
function assert(condition, message) {
  if (condition) {
    console.log(`  [ PASS ]  ${message}`);
    passed++;
  } else {
    console.error(`  [ FAIL ]  ${message}`);
    failed++;
  }
}

/**
 * Writes a temporary .env fixture file and returns its path.
 *
 * @param  {string} content
 * @returns {string}
 */
function tmpFile(content) {
  const p = join(tmpdir(), `dotenv-test-${Math.random()}.env`);
  writeFileSync(p, content, 'utf-8');
  return p;
}

// ---------------------------------------------------------------------------
// Tests — parser.js
// ---------------------------------------------------------------------------

console.log('\n  [ DOTENV-CHECKER ]  test suite\n');
console.log('  Parser\n');

// Basic KEY=VALUE
{
  const f       = tmpFile('FOO=bar\nBAZ=123\n');
  const entries = parseEnvFile(f);
  assert(entries.has('FOO'),                 'parses FOO=bar');
  assert(entries.get('FOO').value === 'bar', 'value is bar');
  assert(entries.has('BAZ'),                 'parses BAZ=123');
}

// Quoted values
{
  const f       = tmpFile('KEY="hello world"\nKEY2=\'single\'\n');
  const entries = parseEnvFile(f);
  assert(entries.get('KEY').value  === 'hello world', 'strips double quotes');
  assert(entries.get('KEY2').value === 'single',      'strips single quotes');
}

// Comments and blank lines
{
  const f       = tmpFile('# comment\n\nKEY=value\n');
  const entries = parseEnvFile(f);
  assert(!entries.has('# comment'), 'ignores comments');
  assert(entries.has('KEY'),        'parses key after blank line');
  assert(entries.size === 1,        'only 1 entry');
}

// Empty value
{
  const f       = tmpFile('EMPTY=\n');
  const entries = parseEnvFile(f);
  assert(entries.has('EMPTY'),               'parses empty key');
  assert(!entries.get('EMPTY').hasValue,     'hasValue is false for empty');
}

// Missing file
{
  const result = parseEnvFile('/nonexistent/path/.env');
  assert(result === null, 'returns null for missing file');
}

// ---------------------------------------------------------------------------
// Tests — checker.js
// ---------------------------------------------------------------------------

console.log('\n  Checker\n');

// Missing key
{
  const results = check(
    parseEnvFile(tmpFile('FOO=bar')),
    parseEnvFile(tmpFile('FOO=\nBAR=\n')),
  );
  assert(results.missing.length === 1,     'detects 1 missing key (BAR)');
  assert(results.missing[0].key === 'BAR', 'missing key is BAR');
}

// Extra key
{
  const results = check(
    parseEnvFile(tmpFile('FOO=bar\nSECRET=xyz\n')),
    parseEnvFile(tmpFile('FOO=\n')),
  );
  assert(results.extra.length === 1,         'detects 1 extra key (SECRET)');
  assert(results.extra[0].key === 'SECRET',  'extra key is SECRET');
}

// Empty value
{
  const results = check(
    parseEnvFile(tmpFile('FOO=\n')),
    parseEnvFile(tmpFile('FOO=\n')),
  );
  assert(results.empty.length === 1,     'detects 1 empty key');
  assert(results.empty[0].key === 'FOO', 'empty key is FOO');
}

// All ok
{
  const results = check(
    parseEnvFile(tmpFile('FOO=bar\nBAZ=hello\n')),
    parseEnvFile(tmpFile('FOO=\nBAZ=\n')),
  );
  assert(results.ok.length === 2,      'marks 2 keys as ok');
  assert(results.missing.length === 0, 'no missing keys');
  assert(results.extra.length === 0,   'no extra keys');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n  ${passed} passed  /  ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
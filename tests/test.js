/**
 * @file test.js
 * @description Comprehensive test suite for parser, checker, scanner and fixer modules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { parseEnvFile } from '../src/parser.js';
import { check } from '../src/checker.js';
import { fixEnvFile, syncReferenceFile } from '../src/fixer.js';
import { scanProject, findMatchingReference } from '../src/scanner.js';

/**
 * Creates a temporary environment fixture file for testing.
 *
 * @param  {string} content - Raw text content to write to the file
 * @returns {string} Absolute path to the temporary file
 */
function tmpFile(content) {
  const filePath = join(tmpdir(), `dotenv-test-${Math.random().toString(36).slice(2)}.env`);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('Parser Module', () => {
  it('parses standard key-value assignments', () => {
    const file = tmpFile('FOO=bar\nBAZ=123\n');
    const entries = parseEnvFile(file);
    assert.equal(entries.get('FOO').value, 'bar');
    assert.equal(entries.get('BAZ').value, '123');
  });

  it('supports export prefix syntax', () => {
    const file = tmpFile('export API_KEY=token123\nexport PORT=8080\n');
    const entries = parseEnvFile(file);
    assert.equal(entries.has('API_KEY'), true);
    assert.equal(entries.get('API_KEY').value, 'token123');
    assert.equal(entries.get('PORT').value, '8080');
  });

  it('strips inline comments outside of quotes', () => {
    const file = tmpFile('DB_PORT=5432 # production port\nCACHE_ENABLED=true # redis flag\n');
    const entries = parseEnvFile(file);
    assert.equal(entries.get('DB_PORT').value, '5432');
    assert.equal(entries.get('CACHE_ENABLED').value, 'true');
  });

  it('preserves hash characters inside quoted strings', () => {
    const file = tmpFile('COLOR="#FF0000" # hex color code\nMSG=\'hello # world\'\n');
    const entries = parseEnvFile(file);
    assert.equal(entries.get('COLOR').value, '#FF0000');
    assert.equal(entries.get('MSG').value, 'hello # world');
  });

  it('strips quotation marks from values', () => {
    const file = tmpFile('KEY="hello world"\nKEY2=\'single\'\n');
    const entries = parseEnvFile(file);
    assert.equal(entries.get('KEY').value, 'hello world');
    assert.equal(entries.get('KEY2').value, 'single');
  });

  it('ignores comment lines and blank lines', () => {
    const file = tmpFile('# comment\n\nKEY=value\n');
    const entries = parseEnvFile(file);
    assert.equal(entries.has('# comment'), false);
    assert.equal(entries.size, 1);
  });

  it('correctly flags empty variable values', () => {
    const file = tmpFile('EMPTY=\n');
    const entries = parseEnvFile(file);
    assert.equal(entries.get('EMPTY').hasValue, false);
  });

  it('returns null when requested file does not exist', () => {
    assert.equal(parseEnvFile('/nonexistent/path/.env'), null);
  });
});

describe('Checker Module', () => {
  it('identifies keys present in template but missing in environment', () => {
    const results = check(
      parseEnvFile(tmpFile('FOO=bar')),
      parseEnvFile(tmpFile('FOO=\nBAR=\n'))
    );
    assert.equal(results.missing.length, 1);
    assert.equal(results.missing[0].key, 'BAR');
  });

  it('identifies keys present in environment but absent from template', () => {
    const results = check(
      parseEnvFile(tmpFile('FOO=bar\nSECRET=xyz\n')),
      parseEnvFile(tmpFile('FOO=\n'))
    );
    assert.equal(results.extra.length, 1);
    assert.equal(results.extra[0].key, 'SECRET');
  });

  it('identifies variables defined without a value', () => {
    const results = check(
      parseEnvFile(tmpFile('FOO=\n')),
      parseEnvFile(tmpFile('FOO=\n'))
    );
    assert.equal(results.empty.length, 1);
    assert.equal(results.empty[0].key, 'FOO');
  });

  it('marks synchronized keys with values as valid', () => {
    const results = check(
      parseEnvFile(tmpFile('FOO=bar\nBAZ=hello\n')),
      parseEnvFile(tmpFile('FOO=\nBAZ=\n'))
    );
    assert.equal(results.ok.length, 2);
    assert.equal(results.missing.length, 0);
    assert.equal(results.extra.length, 0);
  });
});

describe('Scanner Module', () => {
  it('identifies specific matching reference template files', () => {
    const envFile = join('/app', '.env.local');
    const referenceFiles = [join('/app', '.env.example'), join('/app', '.env.local.example')];
    const matched = findMatchingReference(envFile, referenceFiles);
    assert.equal(matched, join('/app', '.env.local.example'));
  });

  it('falls back to default .env.example when specific template is absent', () => {
    const envFile = join('/app', '.env.staging');
    const referenceFiles = [join('/app', '.env.example')];
    const matched = findMatchingReference(envFile, referenceFiles);
    assert.equal(matched, join('/app', '.env.example'));
  });

  it('ignores excluded directory trees during workspace walk', () => {
    const testDir = join(tmpdir(), `dotenv-scan-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testDir, 'node_modules'), { recursive: true });
    mkdirSync(join(testDir, 'src'), { recursive: true });

    writeFileSync(join(testDir, '.env'), 'A=1\n');
    writeFileSync(join(testDir, '.env.example'), 'A=1\n');
    writeFileSync(join(testDir, 'node_modules', '.env'), 'IGNORED=1\n');

    const { envFiles, referenceFiles } = scanProject(testDir);
    assert.equal(envFiles.length, 1);
    assert.equal(referenceFiles.length, 1);
    assert.equal(envFiles[0].includes('node_modules'), false);
  });
});

describe('Fixer Module', () => {
  it('appends missing keys from reference template into existing target file', () => {
    const envFile = tmpFile('PORT=3000\n');
    const exampleFile = tmpFile('PORT=3000\nAPI_KEY=secret_token\nDATABASE_URL=postgres://localhost\n');
    const envEntries = parseEnvFile(envFile);
    const exampleEntries = parseEnvFile(exampleFile);
    const results = check(envEntries, exampleEntries);

    const fixResult = fixEnvFile(envFile, exampleFile, results.missing, exampleEntries);
    assert.equal(fixResult.addedKeys.length, 2);
    assert.equal(fixResult.created, false);

    const updatedEntries = parseEnvFile(envFile);
    assert.equal(updatedEntries.get('API_KEY').value, 'secret_token');
    assert.equal(updatedEntries.get('PORT').value, '3000');
  });

  it('simulates changes when dryRun is enabled without writing to disk', () => {
    const envFile = tmpFile('PORT=3000\n');
    const exampleFile = tmpFile('PORT=3000\nNEW_KEY=val\n');
    const envEntries = parseEnvFile(envFile);
    const exampleEntries = parseEnvFile(exampleFile);
    const results = check(envEntries, exampleEntries);

    const fixResult = fixEnvFile(envFile, exampleFile, results.missing, exampleEntries, { dryRun: true });
    assert.equal(fixResult.dryRun, true);
    assert.equal(fixResult.addedKeys.length, 1);

    const content = readFileSync(envFile, 'utf-8');
    assert.equal(content.includes('NEW_KEY'), false);
  });

  it('creates a backup file when backup option is enabled', () => {
    const envFile = tmpFile('PORT=3000\n');
    const exampleFile = tmpFile('PORT=3000\nNEW_KEY=val\n');
    const envEntries = parseEnvFile(envFile);
    const exampleEntries = parseEnvFile(exampleFile);
    const results = check(envEntries, exampleEntries);

    const fixResult = fixEnvFile(envFile, exampleFile, results.missing, exampleEntries, { backup: true });
    assert.equal(fixResult.backupCreated, true);
    assert.equal(existsSync(`${envFile}.bak`), true);

    const backupContent = readFileSync(`${envFile}.bak`, 'utf-8');
    assert.equal(backupContent, 'PORT=3000\n');
  });

  it('initializes destination file when target file is missing', () => {
    const targetEnv = join(tmpdir(), `dotenv-test-created-${Math.random().toString(36).slice(2)}.env`);
    const exampleFile = tmpFile('HOST=127.0.0.1\nPORT=8080\n');
    const exampleEntries = parseEnvFile(exampleFile);

    const fixResult = fixEnvFile(targetEnv, exampleFile, undefined, exampleEntries);
    assert.equal(fixResult.created, true);

    const createdEntries = parseEnvFile(targetEnv);
    assert.equal(createdEntries.get('HOST').value, '127.0.0.1');
    assert.equal(createdEntries.get('PORT').value, '8080');
  });

  it('wraps values containing whitespace in quotation marks', () => {
    const envFile = tmpFile('APP_NAME=MyApp\n');
    const exampleFile = tmpFile('APP_NAME=MyApp\nGREETING="Hello World"\n');
    const envEntries = parseEnvFile(envFile);
    const exampleEntries = parseEnvFile(exampleFile);
    const results = check(envEntries, exampleEntries);

    fixEnvFile(envFile, exampleFile, results.missing, exampleEntries);
    const content = readFileSync(envFile, 'utf-8');
    assert.match(content, /GREETING="Hello World"/);
  });

  it('performs no write operations when all keys are already present', () => {
    const envFile = tmpFile('FOO=bar\n');
    const exampleFile = tmpFile('FOO=bar\n');
    const envEntries = parseEnvFile(envFile);
    const exampleEntries = parseEnvFile(exampleFile);
    const results = check(envEntries, exampleEntries);

    const fixResult = fixEnvFile(envFile, exampleFile, results.missing, exampleEntries);
    assert.equal(fixResult.addedKeys.length, 0);
  });

  it('synchronizes undocumented keys into reference template without leaking values', () => {
    const exampleFile = tmpFile('EXISTING=val\n');
    const knownKeys = new Map([
      ['EXISTING', { value: 'val', line: 1, hasValue: true }],
      ['SECRET_TOKEN', { value: 'my_super_secret_123', line: 2, hasValue: true }],
      ['DATABASE_URL', { value: 'postgres://user:pass@host/db', line: 3, hasValue: true }],
    ]);

    const result = syncReferenceFile(exampleFile, knownKeys);
    assert.equal(result.addedKeys.length, 2);

    const content = readFileSync(exampleFile, 'utf-8');
    assert.match(content, /SECRET_TOKEN=\r?\n/);
    assert.match(content, /DATABASE_URL=\r?\n/);
    assert.equal(content.includes('my_super_secret_123'), false);
    assert.equal(content.includes('postgres://user:pass@host/db'), false);
  });
});

describe('CLI Binary', () => {
  const cliPath = join(process.cwd(), 'src', 'cli.js');

  it('outputs version string with --version flag', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    const output = execFileSync(process.execPath, [cliPath, '--version'], { encoding: 'utf-8' });
    assert.equal(output.trim(), `v${pkg.version}`);
  });

  it('outputs version string with -V flag', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    const output = execFileSync(process.execPath, [cliPath, '-V'], { encoding: 'utf-8' });
    assert.equal(output.trim(), `v${pkg.version}`);
  });
});

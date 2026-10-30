/**
 * @file lint.js
 * @description Cross-platform syntax checker for all project JavaScript files.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const targetDirs = ['src', 'tests'];

for (const dir of targetDirs) {
  const dirPath = path.resolve(dir);
  if (!fs.existsSync(dirPath)) continue;

  const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.js'));
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    execFileSync(process.execPath, ['--check', fullPath], { stdio: 'inherit' });
  }
}

console.log('[ LINT ] All JavaScript source and test files passed syntax check.');

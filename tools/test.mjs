import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './project.mjs';
import { runCommand } from './process.mjs';

export function discoverTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map(entry => resolve(directory, entry.name)).sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tests = discoverTests(resolve(ROOT, 'tests'));
  if (!tests.length) { console.error('NO_TEST_FILES'); process.exitCode = 1; }
  else {
    const run = runCommand('node', ['--test', ...tests], { cwd: ROOT, stdio: 'inherit' });
    process.exitCode = run.status ?? 1;
  }
}

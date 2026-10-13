import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { commandInvocation } from '../tools/process.mjs';
import { discoverTests } from '../tools/test.mjs';

test('Windows npm invocation uses Node and npm-cli.js with literal arguments', () => {
  const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
  const npmCli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
  assert.deepEqual(commandInvocation('npm', ['run', 'check'], { nodePath, npmCli }),
    [nodePath, [npmCli, 'run', 'check']]);
  assert.deepEqual(commandInvocation('node', ['--version'], { nodePath }), [nodePath, ['--version']]);
});

test('process invocation preserves paths with spaces and shell metacharacters as data', () => {
  const root = mkdtempSync(join(tmpdir(), 'routevela process space '));
  try {
    const npmCli = join(root, 'npm-cli.js');
    writeFileSync(npmCli, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
    const args = ['run', 'literal space & value', '$(not-a-command)'];
    const [executable, argv] = commandInvocation('npm', args, { npmCli });
    const run = spawnSync(executable, argv, { encoding: 'utf8', shell: false });
    assert.equal(run.status, 0); assert.deepEqual(JSON.parse(run.stdout), args);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('test discovery uses literal file paths without depending on shell wildcards', () => {
  const root = mkdtempSync(join(tmpdir(), 'routevela tests space '));
  try {
    writeFileSync(join(root, 'b.test.mjs'), ''); writeFileSync(join(root, 'a.test.mjs'), '');
    writeFileSync(join(root, 'helpers.mjs'), ''); mkdirSync(join(root, 'directory.test.mjs'));
    assert.deepEqual(discoverTests(root), [join(root, 'a.test.mjs'), join(root, 'b.test.mjs')]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

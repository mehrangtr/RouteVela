import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { architectureErrors } from '../tools/architecture.mjs';
import { project } from '../tools/project.mjs';

function inspect(files, change = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'routevela-architecture-'));
  try {
    const modules = structuredClone(project().modules); change(modules);
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      module: 'NodeNext', moduleResolution: 'NodeNext', types: [], lib: ['ES2023'],
      paths: { '@store': ['./src/storage/index.ts'], '@private': ['./src/config/private.ts'] },
    }, include: ['src/**/*.ts'] }));
    for (const [name, body] of Object.entries(files)) {
      mkdirSync(join(root, name, '..'), { recursive: true }); writeFileSync(join(root, name), body);
    }
    return architectureErrors(root, modules);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('compiler resolution accepts public imports and ignores comment/string decoys', () => {
  assert.deepEqual(inspect({ 'src/config/index.ts': 'export const x = 1;',
    'src/compiler/index.ts': "import { x } from '../config/index.js';\n// import('../storage/index.js')\nconst text = \"import('../storage/index.js')\"; export { x };" }), []);
});

test('multiline imports, aliases, re-exports and import types cannot reach privileged/private modules', () => {
  const targets = { 'src/storage/index.ts': 'export const x = 1;', 'src/config/private.ts': 'export type X = string;' };
  for (const body of ["import {\nx\n} from '../storage/index.js';", "export * from '@store';", "type X = import('@store').X;"]) {
    assert.ok(inspect({ ...targets, 'src/ui/index.ts': body }).some(error => error.startsWith('DISALLOWED_DEPENDENCY')));
  }
  assert.ok(inspect({ ...targets, 'src/compiler/index.ts': "export type { X } from '@private';" }).some(error => error.startsWith('PRIVATE_MODULE_IMPORT')));
  assert.ok(inspect({ ...targets, 'src/ui/types.d.ts': "export * from '@store';" }).some(error => error.startsWith('DISALLOWED_DEPENDENCY')));
  assert.ok(inspect({ ...targets, 'src/ui/index.ts': '/// <reference path="../storage/index.ts" />' }).some(error => error.startsWith('DISALLOWED_DEPENDENCY')));
});

test('dynamic loading, require and files outside the declared build are rejected', () => {
  for (const body of ["const p = import('../config/index.js');", "const p = require('../config/index.js');", "import p = require('../config/index.js');"]) {
    assert.ok(inspect({ 'src/compiler/index.ts': body, 'src/config/index.ts': 'export const x = 1;' }).length > 0);
  }
  assert.ok(inspect({ 'src/unknown/index.ts': 'export const x = 1;' }).some(error => error.startsWith('UNDECLARED_MODULE')));
  assert.ok(inspect({ 'src/contracts/index.ts': 'export const x = 1;', 'src/ui/hidden.mts': 'export const x = 1;' }).some(error => error.startsWith('SOURCE_OUTSIDE_BUILD')));
  assert.ok(inspect({ 'outside.ts': 'export const x = 1;', 'src/domain/index.ts': "export * from '../../outside.js';" }).some(error => error.startsWith('OUTSIDE_MODULES')));
});

test('an actual module cycle fails even if both import edges have been allowed', () => {
  const errors = inspect({ 'src/config/index.ts': "export * from '../compiler/index.js'; export const a = 1;",
    'src/compiler/index.ts': "export * from '../config/index.js'; export const b = 1;" }, modules => modules.modules.config.allowed_imports.push('compiler'));
  assert.ok(errors.some(error => error.startsWith('MODULE_CYCLE')));
});

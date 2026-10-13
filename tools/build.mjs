import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './project.mjs';

// A failing compilation must not leave an older apparently usable distribution.
rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true });
const run = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc'], {
  cwd: ROOT, stdio: 'inherit',
});
process.exitCode = run.status ?? 1;

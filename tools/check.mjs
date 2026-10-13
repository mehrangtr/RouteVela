import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, project, validateProject, listFiles, requiredMissing, boundaryErrors, secretErrors } from './project.mjs';

try {
  const data = project();
  const errors = [...requiredMissing().map(x => `MISSING:${x}`), ...validateProject(data)];
  for (const path of listFiles()) {
    const content = readFileSync(resolve(ROOT, path), 'utf8');
    errors.push(...secretErrors(path, content));
    if (/\.(?:mjs|js|ts)$/.test(path)) errors.push(...boundaryErrors(path, content, data.modules));
    if (/\.(?:mjs|js)$/.test(path)) {
      const check = spawnSync(process.execPath, ['--check', resolve(ROOT, path)], { encoding: 'utf8' });
      if (check.status !== 0) errors.push(`SYNTAX:${path}`);
    }
  }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('PASS: project contracts, required files, JS syntax, early import guard and secret-pattern guard. No app typecheck/live connection claimed.');
} catch (error) { console.error(`CHECK_INPUT_ERROR:${error.name}`); process.exitCode = 1; }

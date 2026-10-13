import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, project, validateProject, listFiles, requiredMissing, secretErrors, languageErrors } from './project.mjs';
import { architectureErrors } from './architecture.mjs';

try {
  const data = project();
  const errors = [...requiredMissing().map(x => `MISSING:${x}`), ...validateProject(data), ...architectureErrors(ROOT, data.modules)];
  for (const path of listFiles()) {
    const content = readFileSync(resolve(ROOT, path), 'utf8');
    errors.push(...secretErrors(path, content));
    errors.push(...languageErrors(path, content));
    if (/\.(?:mjs|js)$/.test(path)) {
      const check = spawnSync(process.execPath, ['--check', resolve(ROOT, path)], { encoding: 'utf8' });
      if (check.status !== 0) errors.push(`SYNTAX:${path}`);
    }
  }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('PASS: project contracts, JS syntax, compiler-backed module boundaries, secret/script guards. Run typecheck separately; no live connection claimed.');
} catch (error) { console.error(`CHECK_INPUT_ERROR:${error.name}`); process.exitCode = 1; }

import { spawnSync } from 'node:child_process';
import { requiredMissing } from './project.mjs';
const errors = requiredMissing().map(x => `MISSING:${x}`);
if (Number(process.versions.node.split('.')[0]) !== 24) errors.push('REQUIRES_NODE_24');
const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
if (git.status !== 0) errors.push('GIT_UNAVAILABLE');
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`PASS: Node ${process.versions.node}; ${git.stdout.trim()}; preparation files present. No production credential required.`);

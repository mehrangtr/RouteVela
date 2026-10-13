import { readFileSync } from 'node:fs';
import { renderProfile } from '../dist/app/index.js';
import { FIXTURE_TARGET } from '../dist/compiler/index.js';

const source = readFileSync(new URL('../tests/fixtures/profile.json', import.meta.url), 'utf8');
const result = renderProfile(source, { protocols: ['vless'], transports: ['ws'], tls: true }, FIXTURE_TARGET);
if (result.ok) process.stdout.write(result.value);
else { console.error(JSON.stringify(result.error)); process.exitCode = 1; }

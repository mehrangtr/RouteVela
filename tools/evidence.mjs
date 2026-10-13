import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, readJson, inputManifest, verifyEvidence } from './project.mjs';
const [action, phase] = process.argv.slice(2);
try {
  if (!/^P\d{2}$/.test(phase ?? '')) throw new Error('Provide an explicit phase ID.');
  if (action === 'record') {
    if (phase !== 'P00') throw new Error('Only P00 runner exists. Add the actual phase checks before recording another phase.');
    const commands = [['tools/doctor.mjs'], ['tools/check.mjs'], ['--test', 'tests/preflight.test.mjs']];
    const before = inputManifest();
    const checks = [];
    for (const args of commands) {
      const run = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
      const result = { command: `node ${args.join(' ')}`, execution_context: 'local_process', exit_code: run.status, result: run.status === 0 ? 'pass' : 'fail',
        summary: run.status === 0 ? run.stdout.trim().split('\n').slice(-6).join('\n') : 'Check failed; inspect local output.' };
      checks.push(result);
      if (run.status !== 0) { console.error(run.stdout, run.stderr); throw new Error('Gate failed; no evidence was written.'); }
    }
    const after = inputManifest();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Inputs changed during checks.');
    const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
    const roadmap = readJson('ROADMAP.json');
    const record = { schema_version: 1, phase, created_at_utc: new Date().toISOString(),
      environment: { node: process.version, git: git.stdout.trim(), platform: process.platform, arch: process.arch },
      input_sha256: after, checks,
      acceptance: roadmap.phases.find(p => p.id === phase).acceptance.map((id, index) => ({
        id: id.split(':')[0], result: index < 2 ? 'needs_review' : 'pass',
        verification_method: index < 2 ? 'document_review_required' : 'automated_local_run',
        basis: index < 2 ? 'Explicit requirement/roadmap review required before phase closure.' : 'Executed preparation gates and generated input manifest.' })),
      not_run: ['Application TypeScript typecheck/build (not implemented in P00)', 'Cloudflare deployment', 'Real client import/connect', 'ISP performance benchmark'],
      limitations: ['P00 tests preparation tooling only.', 'The static import/secret guards are conservative, incomplete first guards.', 'The script guard detects raw Arabic-script characters, not every possible non-English language.', 'Provider permission and free-egress viability remain unresolved; gate references require substantive review.', 'Local execution and agent document review are not independent review or observed remote CI.', 'STATE.json is a mutable checkpoint validated by check, excluded from the immutable input manifest.'] };
    mkdirSync(resolve(ROOT, 'evidence'), { recursive: true });
    writeFileSync(resolve(ROOT, `evidence/${phase}.json`), JSON.stringify(record, null, 2) + '\n');
    console.log(`PASS: recorded ${phase} checks for ${Object.keys(after).length} hashed input files; documentation acceptance still needs explicit review. No phase closure/publication performed.`);
  } else if (action === 'verify') {
    const record = readJson(`evidence/${phase}.json`);
    if (record.phase !== phase) throw new Error('Evidence phase differs from requested phase.');
    const errors = verifyEvidence(record, inputManifest());
    if (errors.length) throw new Error(errors.join(','));
    console.log(`PASS: ${phase} evidence matches current inputs and successful recorded checks.`);
  } else throw new Error('Use record or verify.');
} catch (error) { console.error(`EVIDENCE_ERROR:${error.message}`); process.exitCode = 1; }

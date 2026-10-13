import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, readJson, inputManifest, verifyEvidence } from './project.mjs';

const [action, phase] = process.argv.slice(2);
const gates = {
  P00: [
    ['node', ['tools/doctor.mjs']], ['node', ['tools/check.mjs']],
    ['node', ['--test', 'tests/preflight.test.mjs']],
  ],
  P01: [
    ['npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']],
    ...['doctor', 'check', 'typecheck', 'lint'].map(name => ['npm', ['run', name]]),
    ['npm', ['test']], ['npm', ['run', 'audit']],
  ],
};
const commandText = ([command, args]) => [command, ...args].join(' ');
try {
  if (!/^P\d{2}$/.test(phase ?? '')) throw new Error('Provide an explicit phase ID.');
  if (!gates[phase]) throw new Error('Add the actual phase runner before recording or verifying this phase.');
  const roadmap = readJson('ROADMAP.json');
  const criteria = roadmap.phases.find(p => p.id === phase).acceptance;
  const testCommand = phase === 'P01' ? 'npm test' : 'node --test tests/preflight.test.mjs';
  if (action === 'record') {
    const before = inputManifest();
    const checks = [];
    for (const [command, args] of gates[phase]) {
      const run = spawnSync(command === 'node' ? process.execPath : command, args, {
        cwd: ROOT, encoding: 'utf8', timeout: 120000,
      });
      const description = commandText([command, args]);
      const result = { command: description, execution_context: 'local_process', exit_code: run.status,
        result: run.status === 0 ? 'pass' : 'fail',
        summary: run.status === 0 ? run.stdout.trim().split('\n').slice(-7).join('\n') : 'Check failed; inspect local output.' };
      if (description === testCommand) {
        const count = run.stdout.match(/(?:\u2139|#) tests (\d+)/);
        const failed = run.stdout.match(/(?:\u2139|#) fail (\d+)/);
        const skipped = run.stdout.match(/(?:\u2139|#) skipped (\d+)/);
        result.test_counts = { executed: Number(count?.[1] ?? 0), failed: Number(failed?.[1] ?? -1),
          skipped: Number(skipped?.[1] ?? -1) };
        if (result.test_counts.executed === 0 || result.test_counts.failed !== 0 || result.test_counts.skipped !== 0) {
          result.result = 'fail';
        }
      }
      checks.push(result);
      if (result.result !== 'pass') {
        console.error(run.stdout, run.stderr);
        throw new Error('Gate failed or test outcome was incomplete; no evidence was written.');
      }
    }
    const after = inputManifest();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Inputs changed during checks.');
    const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
    const npm = spawnSync('npm', ['--version'], { encoding: 'utf8' });
    const toolVersions = Object.fromEntries(['typescript', 'eslint', 'typescript-eslint']
      .map(name => [name, readJson(`node_modules/${name}/package.json`).version]));
    const needsReview = index => phase === 'P00' ? index < 2 : index === 3;
    const record = {
      schema_version: 1, phase, created_at_utc: new Date().toISOString(),
      environment: { node: process.version, npm: npm.stdout.trim(), git: git.stdout.trim(),
        platform: process.platform, arch: process.arch, tools: toolVersions },
      input_sha256: after, checks,
      acceptance: criteria.map((text, index) => ({
        id: text.split(':')[0], result: needsReview(index) ? 'needs_review' : 'pass',
        verification_method: needsReview(index) ? 'document_review_required' : 'automated_local_run',
        basis: needsReview(index) ? 'Review dated source findings and actual blockers before phase closure.' :
          'Executed the required phase gates, compiled behavior tests and recorded the input manifest.',
      })),
      not_run: ['Cloudflare/VPN deployment', 'Real core parser/device import/connect/update',
        'Target ISP performance benchmark', 'Production admin authentication and durable storage'],
      limitations: [
        phase === 'P01' ? 'P01 is a local typed foundation, not a working VPN or UI.' : 'P00 validates preparation tooling only.',
        'Policy checks use trusted metadata; they do not verify secrets or implement durable revocation.',
        'The sing-box output is a deterministic schema fixture, not tested live core compatibility.',
        'Fake random/clock/repository implementations are test-only.',
        'The import graph guard is not a security sandbox; script/secret guards are incomplete.',
        'Provider permission and free-egress viability remain unresolved.',
        'Direct official terms access returned proxy 403; immutable official documentation sources were inspected.',
        'Local execution and author review are not independent review or observed remote CI.',
        'STATE.json is mutable, separately checked and excluded from the input manifest.',
      ],
    };
    mkdirSync(resolve(ROOT, 'evidence'), { recursive: true });
    writeFileSync(resolve(ROOT, `evidence/${phase}.json`), JSON.stringify(record, null, 2) + '\n');
    console.log(`PASS: recorded ${phase} gates and ${Object.keys(after).length} input hashes; document acceptance needs review. No phase closure/publication performed.`);
  } else if (action === 'verify') {
    const record = readJson(`evidence/${phase}.json`);
    if (record.phase !== phase) throw new Error('Evidence phase differs from requested phase.');
    const errors = verifyEvidence(record, inputManifest(), {
      acceptanceIds: criteria.map(text => text.split(':')[0]),
      commands: gates[phase].map(commandText), testCommand,
    });
    if (errors.length) throw new Error(errors.join(','));
    console.log(`PASS: ${phase} current input hashes, acceptance IDs, required command records and test counts match.`);
  } else throw new Error('Use record or verify.');
} catch (error) { console.error(`EVIDENCE_ERROR:${error.message}`); process.exitCode = 1; }

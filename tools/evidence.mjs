import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCommand } from './process.mjs';
import { ROOT, readJson, inputManifest, verifyEvidence, verifyLocalP02Evidence } from './project.mjs';

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
// P02's local runner cannot establish the separately gated live acceptance.
gates.P02 = gates.P01;
try {
  if (!/^P\d{2}$/.test(phase ?? '')) throw new Error('Provide an explicit phase ID.');
  if (!gates[phase]) throw new Error('Add the actual phase runner before recording or verifying this phase.');
  const roadmap = readJson('ROADMAP.json');
  const criteria = roadmap.phases.find(p => p.id === phase).acceptance;
  const testCommand = phase === 'P00' ? 'node --test tests/preflight.test.mjs' : 'npm test';
  if (action === 'record') {
    const before = inputManifest();
    const checks = [];
    for (const [command, args] of gates[phase]) {
      const run = runCommand(command, args, {
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
    const npm = runCommand('npm', ['--version'], { encoding: 'utf8' });
    const toolVersions = Object.fromEntries(['typescript', 'eslint', 'typescript-eslint', 'ws']
      .map(name => [name, readJson(`node_modules/${name}/package.json`).version]));
    const needsReview = index => phase === 'P00' ? index < 2 : index === 3;
    const record = {
      schema_version: 1, phase, created_at_utc: new Date().toISOString(),
      ...(phase === 'P02' ? { scope: 'local_partial', phase_readiness: 'blocked' } : {}),
      environment: { node: process.version, npm: npm.stdout.trim(), git: git.stdout.trim(),
        platform: process.platform, arch: process.arch, tools: toolVersions },
      input_sha256: after, checks,
      acceptance: criteria.map((text, index) => ({
        id: text.split(':')[0], result: phase === 'P02' ? (index === 0 ? 'pass' : 'not_run') : (needsReview(index) ? 'needs_review' : 'pass'),
        verification_method: phase === 'P02' && index > 0 ? 'external_prerequisite_missing' : (needsReview(index) && phase !== 'P02' ? 'document_review_required' : 'automated_local_run'),
        basis: phase === 'P02' && index > 0 ? 'Only loopback/local trials executed; applicable permission and a genuine free live egress path remain unresolved.' :
          needsReview(index) && phase !== 'P02' ? 'Review dated source findings and actual blockers before phase closure.' :
          'Executed the required phase gates, compiled behavior tests and recorded the input manifest.',
      })),
      not_run: ['Cloudflare/VPN deployment', 'Real core parser/device import/connect/update',
        'Target ISP performance benchmark', 'Production admin authentication and durable storage',
        'Native Windows runtime/desktop connection trial'],
      limitations: [
        phase === 'P02' ? 'P02 evidence covers local parser/relay and controlled TCP/WebSocket peers only; full phase is blocked.' :
          phase === 'P01' ? 'P01 is a local typed foundation, not a working VPN or UI.' : 'P00 validates preparation tooling only.',
        'Policy checks use trusted metadata; they do not verify secrets or implement durable revocation.',
        'The sing-box output is a deterministic schema fixture, not tested live core compatibility.',
        'Fake random/clock/repository and loopback socket adapters are test-only; authentication/destination-policy ports remain required.',
        'The import graph guard is not a security sandbox; script/secret guards are incomplete.',
        'Provider permission and free-egress viability remain unresolved.',
        'Direct official terms access returned proxy 403; immutable official documentation sources were inspected.',
        'Local execution and author review are not independent review or observed remote CI.',
        'STATE.json is mutable, separately checked and excluded from the input manifest.',
      ],
    };
    mkdirSync(resolve(ROOT, 'evidence'), { recursive: true });
    writeFileSync(resolve(ROOT, `evidence/${phase}.json`), JSON.stringify(record, null, 2) + '\n');
    console.log(`PASS: recorded ${phase} local gates and ${Object.keys(after).length} input hashes. ${phase === 'P02' ? 'Live criteria are not_run; phase remains blocked.' : 'Document acceptance needs review.'} No phase closure/publication performed.`);
  } else if (action === 'verify' || action === 'verify-local') {
    const record = readJson(`evidence/${phase}.json`);
    if (record.phase !== phase) throw new Error('Evidence phase differs from requested phase.');
    const expected = {
      acceptanceIds: criteria.map(text => text.split(':')[0]),
      commands: gates[phase].map(commandText), testCommand,
    };
    if (action === 'verify-local' && phase !== 'P02') throw new Error('Local partial verification is only implemented for P02.');
    const errors = action === 'verify-local' ? verifyLocalP02Evidence(record, inputManifest(), expected) : verifyEvidence(record, inputManifest(), expected);
    if (action === 'verify' && phase === 'P02' && record.scope === 'local_partial') errors.push('P02_LIVE_GATES_UNRUN');
    if (errors.length) throw new Error(errors.join(','));
    console.log(`PASS: ${phase} ${action === 'verify-local' ? 'local evidence only; live criteria NOT RUN and phase blocked. ' : ''}Current hashes, required command records and test counts match.`);
  } else throw new Error('Use record, verify or verify-local.');
} catch (error) { console.error(`EVIDENCE_ERROR:${error.message}`); process.exitCode = 1; }

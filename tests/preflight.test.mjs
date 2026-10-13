import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project, validateProject, boundaryErrors, secretErrors, languageErrors, contextPack,
  inputManifest, verifyEvidence, verifyLocalP02Evidence } from '../tools/project.mjs';
const baseline = project();
const copy = () => structuredClone(baseline);

test('the real preparation roadmap and checkpoint are consistent', () => {
  assert.deepEqual(validateProject(baseline), []);
});
test('an invalid next task and missing resume action are rejected', () => {
  const p = copy(); p.state.next_task = 'P99.99'; p.state.resume_action = '';
  assert.ok(validateProject(p).includes('NEXT_TASK'));
  assert.ok(validateProject(p).includes('RESUME_ACTION'));
});
test('future/circular phase dependencies and duplicate tasks are rejected', () => {
  const p = copy(); p.roadmap.phases[0].depends_on = ['P09'];
  p.roadmap.phases[1].tasks[1].id = p.roadmap.phases[1].tasks[0].id;
  assert.ok(validateProject(p).some(x => x.startsWith('PHASE_DEPENDENCY')));
  assert.ok(validateProject(p).some(x => x.startsWith('TASK_ID')));
});
test('connection phase cannot be declared complete with unresolved provider/cost gates', () => {
  const p = copy(); p.state.phase = 'P02'; p.state.phase_status = 'closed'; p.state.next_task = null;
  p.state.completed_phases = ['P00', 'P01', 'P02'];
  p.state.completed_tasks = p.roadmap.phases.slice(0,3).flatMap(x => x.tasks.map(t => t.id));
  assert.ok(validateProject(p).includes('CONNECTION_GATE_UNRESOLVED'));
});
test('closing a phase without its tasks or dependencies is rejected', () => {
  const p = copy(); p.state.completed_phases = ['P03'];
  const errors = validateProject(p);
  assert.ok(errors.includes('INCOMPLETE_CLOSED_PHASE:P03'));
  assert.ok(errors.includes('COMPLETED_DEPENDENCY:P03'));
});
test('connection closure requires both unique resolved gates with evidence references', () => {
  const p = copy();
  p.state.phase = 'P02'; p.state.phase_status = 'closed'; p.state.next_task = null;
  p.state.completed_phases = ['P00', 'P01', 'P02'];
  p.state.completed_tasks = p.roadmap.phases.slice(0, 3).flatMap(x => x.tasks.map(t => t.id));
  const resolved = [
    { id: 'CF_PERMISSION', status: 'resolved', evidence_ref: 'private-record:permission-test-fixture' },
    { id: 'FREE_EGRESS', status: 'resolved', evidence_ref: 'controlled-test:egress-test-fixture' },
  ];
  for (const blockers of [[], [resolved[0]], [resolved[1]],
    [...resolved, resolved[0]], resolved.map(x => ({ ...x, evidence_ref: '' })),
    resolved.map(x => ({ ...x, status: 'unproven' }))]) {
    p.state.blockers = blockers;
    assert.ok(validateProject(p).includes('CONNECTION_GATE_UNRESOLVED'));
  }
  p.state.blockers = resolved;
  assert.deepEqual(validateProject(p), []);
});
test('public permitted imports work; private or privileged shortcuts fail', () => {
  assert.deepEqual(boundaryErrors('src/compiler/render.ts', "import { X } from '../config/index.ts';", baseline.modules), []);
  assert.ok(boundaryErrors('src/ui/view.ts', "import { db } from '../storage/index.ts';", baseline.modules).some(x => x.startsWith('DISALLOWED_DEPENDENCY')));
  assert.ok(boundaryErrors('src/compiler/render.ts', "export { x } from '../config/private.ts';", baseline.modules).some(x => x.startsWith('PRIVATE_MODULE_IMPORT')));
  assert.ok(boundaryErrors('src/domain/user.ts', "const x = import('../providers/index.ts');", baseline.modules).some(x => x.startsWith('DYNAMIC_IMPORT')));
});
test('secret-pattern guard rejects synthetic credential material and secret files', () => {
  const fake = ['gh', 'p_', 'a'.repeat(36)].join('');
  assert.ok(secretErrors('sample.txt', fake).some(x => x.startsWith('GITHUB_CREDENTIAL')));
  assert.ok(secretErrors('.env', 'EXAMPLE=1').some(x => x.startsWith('SECRET_FILE')));
  assert.deepEqual(secretErrors('.env.example', 'EXAMPLE=REPLACE_ME'), []);
});
test('repository language guard rejects raw Persian script but permits escaped locale data', () => {
  assert.deepEqual(languageErrors('guide.md', 'English setup instructions.'), []);
  assert.deepEqual(languageErrors('guide.md', '\u0633\u0644\u0627\u0645'), ['NON_ENGLISH_SCRIPT:guide.md']);
  const locale = JSON.stringify({ label: '\u0633\u0644\u0627\u0645' }).replace(/[\u0600-\u06ff]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  assert.deepEqual(languageErrors('src/ui/locales/fa.json', locale), []);
  assert.equal(JSON.parse(locale).label, '\u0633\u0644\u0627\u0645');
});
test('the context pack selects one next task and omits the full specification', () => {
  const context = contextPack(baseline);
  assert.equal(context.next_task.id, baseline.state.next_task);
  assert.equal(context.acceptance.length, baseline.roadmap.phases.find(x => x.id === baseline.state.phase).acceptance.length);
  assert.ok(JSON.stringify(context).length < 8000);
  assert.ok(!Object.hasOwn(context, 'specification'));
});
test('evidence detects changed input and failed checks; excludes mutable checkpoint only', () => {
  const root = mkdtempSync(join(tmpdir(), 'routevela-test-'));
  try {
    writeFileSync(join(root, 'implementation.txt'), 'one');
    writeFileSync(join(root, 'STATE.json'), '{}');
    const manifest = inputManifest(root);
    const record = { schema_version:1, phase:'P00', created_at_utc:'2026-10-12T00:00:00Z', input_sha256:manifest,
      checks:[{ exit_code:0, result:'pass' }], acceptance:[{ result:'pass' }] };
    assert.deepEqual(verifyEvidence(record, manifest), []);
    writeFileSync(join(root, 'implementation.txt'), 'two');
    assert.ok(verifyEvidence(record, inputManifest(root)).includes('EVIDENCE_INPUT_CHANGED'));
    record.checks[0].exit_code = 1;
    assert.ok(verifyEvidence(record, manifest).includes('EVIDENCE_CHECK_FAILED'));
    assert.ok(!Object.hasOwn(manifest, 'STATE.json'));
  } finally { rmSync(root, { recursive:true, force:true }); }
});
test('phase evidence rejects missing or duplicate criteria/commands and zero or skipped tests', () => {
  const expected = { acceptanceIds: ['P01-A1', 'P01-A2'], commands: ['npm test', 'npm run typecheck'], testCommand: 'npm test' };
  const record = { schema_version: 1, phase: 'P01', created_at_utc: '2026-10-13T00:00:00Z', input_sha256: {},
    acceptance: expected.acceptanceIds.map(id => ({ id, result: 'pass' })),
    checks: expected.commands.map(command => ({ command, exit_code: 0, result: 'pass',
      ...(command === 'npm test' ? { test_counts: { executed: 1, failed: 0, skipped: 0 } } : {}) })) };
  assert.deepEqual(verifyEvidence(record, {}, expected), []);
  const missingCriterion = structuredClone(record); missingCriterion.acceptance.pop();
  assert.ok(verifyEvidence(missingCriterion, {}, expected).includes('EVIDENCE_ACCEPTANCE_IDS'));
  const duplicateCriterion = structuredClone(record); duplicateCriterion.acceptance[1].id = 'P01-A1';
  assert.ok(verifyEvidence(duplicateCriterion, {}, expected).includes('EVIDENCE_ACCEPTANCE_IDS'));
  const missingCommand = structuredClone(record); missingCommand.checks.pop();
  assert.ok(verifyEvidence(missingCommand, {}, expected).includes('EVIDENCE_COMMANDS'));
  for (const counts of [{ executed: 0, failed: 0, skipped: 0 }, { executed: 3, failed: 0, skipped: 1 },
    { executed: 3, failed: 1, skipped: 0 }]) {
    const changed = structuredClone(record); changed.checks[0].test_counts = counts;
    assert.ok(verifyEvidence(changed, {}, expected).includes('EVIDENCE_TEST_COUNTS'));
  }
});

test('partial P02 proof verifies only local criteria and can never become full-phase proof', () => {
  const expected = { acceptanceIds: ['P02-A1', 'P02-A2', 'P02-A3'], commands: ['npm test'], testCommand: 'npm test' };
  const record = { schema_version: 1, phase: 'P02', scope: 'local_partial', phase_readiness: 'blocked',
    created_at_utc: '2026-10-13T00:00:00Z', input_sha256: {}, checks: [{ command: 'npm test', exit_code: 0,
      result: 'pass', test_counts: { executed: 1, failed: 0, skipped: 0 } }],
    acceptance: expected.acceptanceIds.map((id, index) => ({ id, result: index === 0 ? 'pass' : 'not_run' })) };
  assert.ok(verifyEvidence(record, {}, expected).includes('EVIDENCE_ACCEPTANCE'));
  assert.deepEqual(verifyLocalP02Evidence(record, {}, expected), []);
  for (const index of [0, 1, 2]) {
    const changed = structuredClone(record); changed.acceptance[index].result = index === 0 ? 'not_run' : 'pass';
    assert.ok(verifyLocalP02Evidence(changed, {}, expected).includes('LOCAL_EVIDENCE_ACCEPTANCE'));
  }
  const wrong = structuredClone(record); wrong.phase_readiness = 'closed';
  assert.ok(verifyLocalP02Evidence(wrong, {}, expected).includes('LOCAL_EVIDENCE_SCOPE'));
  const failed = structuredClone(record); failed.checks[0].exit_code = 1;
  assert.ok(verifyLocalP02Evidence(failed, {}, expected).includes('EVIDENCE_CHECK_FAILED'));
});

test('evidence requires positive clean counts from every required test runner', () => {
  const expected = { commands: ['npm test', 'npm run test:core'], testCommands: ['npm test', 'npm run test:core'] };
  const record = { schema_version: 1, phase: 'P02', created_at_utc: 'test', input_sha256: {},
    acceptance: [{ id: 'P02-A1', result: 'pass' }],
    checks: expected.commands.map(command => ({ command, exit_code: 0, result: 'pass',
      test_counts: { executed: 1, failed: 0, skipped: 0 } })) };
  assert.deepEqual(verifyEvidence(record, {}, expected), []);
  for (const counts of [undefined, { executed: 0, failed: 0, skipped: 0 },
    { executed: 1, failed: 1, skipped: 0 }, { executed: 1, failed: 0, skipped: 1 }]) {
    const changed = structuredClone(record); changed.checks[1].test_counts = counts;
    assert.ok(verifyEvidence(changed, {}, expected).includes('EVIDENCE_TEST_COUNTS'));
  }
});

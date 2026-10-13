import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, lstatSync } from 'node:fs';
import { dirname, relative, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REQUIRED = ['README.md', 'AGENTS.md', 'PROJECT.txt', 'CONTINUE.md',
  'ROADMAP.json', 'STATE.json', 'module-map.json', 'SECURITY.md', 'LICENSE',
  'package.json', 'package-lock.json', 'docs/ARCHITECTURE.md', 'docs/TESTING.md',
  'docs/SOURCES.json', 'docs/DEPENDENCIES.md', 'tsconfig.json', 'eslint.config.mjs',
  '.github/workflows/ci.yml', '.github/CODEOWNERS'];
const SKIP = new Set(['.git', 'node_modules', 'dist', 'coverage', '.tmp', 'private',
  'backups', '.codex-log']);

export function readJson(path, root = ROOT) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}
export function project(root = ROOT) {
  return { roadmap: readJson('ROADMAP.json', root), state: readJson('STATE.json', root),
    modules: readJson('module-map.json', root) };
}
export function validateProject({ roadmap, state, modules }) {
  const errors = [];
  if ([roadmap, state, modules].some(x => x.schema_version !== 1)) errors.push('SCHEMA_VERSION');
  const ids = roadmap.phases.map(x => x.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !/^P\d{2}$/.test(id))) errors.push('PHASE_IDS');
  const seen = new Set();
  const tasks = new Set();
  for (const phase of roadmap.phases) {
    if (!phase.depends_on.every(id => seen.has(id))) errors.push(`PHASE_DEPENDENCY:${phase.id}`);
    if (!phase.tasks.length || !phase.acceptance.length) errors.push(`EMPTY_PHASE:${phase.id}`);
    for (const task of phase.tasks) {
      if (!task.id.startsWith(`${phase.id}.`) || tasks.has(task.id) || !task.summary.trim()) errors.push(`TASK_ID:${phase.id}`);
      tasks.add(task.id);
    }
    seen.add(phase.id);
  }
  const phase = roadmap.phases.find(x => x.id === state.phase);
  if (!phase) errors.push('STATE_PHASE');
  if (!['not_started', 'in_progress', 'blocked', 'closed'].includes(state.phase_status)) errors.push('STATE_STATUS');
  if (!phase?.tasks.some(x => x.id === state.next_task) && !(state.phase_status === 'closed' && state.next_task === null)) errors.push('NEXT_TASK');
  if (state.next_task && state.completed_tasks.includes(state.next_task)) errors.push('NEXT_TASK_ALREADY_COMPLETED');
  if (!state.resume_action?.trim()) errors.push('RESUME_ACTION');
  if (state.completed_tasks.some(id => !tasks.has(id))) errors.push('COMPLETED_TASK');
  if (new Set(state.completed_tasks).size !== state.completed_tasks.length) errors.push('DUPLICATE_COMPLETED_TASK');
  const done = new Set(state.completed_phases);
  if (done.size !== state.completed_phases.length || [...done].some(id => !ids.includes(id))) errors.push('COMPLETED_PHASE');
  for (const p of roadmap.phases.filter(x => done.has(x.id))) {
    if (!p.depends_on.every(id => done.has(id))) errors.push(`COMPLETED_DEPENDENCY:${p.id}`);
    if (!p.tasks.every(t => state.completed_tasks.includes(t.id))) errors.push(`INCOMPLETE_CLOSED_PHASE:${p.id}`);
  }
  if (phase && !phase.depends_on.every(id => done.has(id))) errors.push('ACTIVE_DEPENDENCY');
  if (state.phase_status === 'closed' && !done.has(state.phase)) errors.push('CLOSED_STATE_MISMATCH');
  if (done.has('P02')) {
    const missingGate = ['CF_PERMISSION', 'FREE_EGRESS'].some(id => {
      const entries = state.blockers.filter(b => b.id === id);
      return entries.length !== 1 || entries[0].status !== 'resolved' ||
        typeof entries[0].evidence_ref !== 'string' || !entries[0].evidence_ref.trim();
    });
    if (missingGate) errors.push('CONNECTION_GATE_UNRESOLVED');
  }
  const names = Object.keys(modules.modules);
  for (const [name, m] of Object.entries(modules.modules)) {
    if (m.path !== `src/${name}` || !m.allowed_imports.every(id => names.includes(id))) errors.push(`MODULE_CONTRACT:${name}`);
  }
  for (const essential of ['domain', 'compiler', 'protocols', 'transports', 'providers', 'storage', 'security', 'ui']) {
    if (!names.includes(essential)) errors.push(`MISSING_MODULE:${essential}`);
  }
  if (modules.modules.ui?.allowed_imports.some(x => ['storage', 'providers', 'security'].includes(x))) errors.push('UI_PRIVILEGED_IMPORT');
  if (modules.modules.domain?.allowed_imports.includes('providers') || modules.modules.compiler?.allowed_imports.includes('storage')) errors.push('CORE_IO_SHORTCUT');
  return errors;
}
export function listFiles(root = ROOT, current = '') {
  const out = [];
  for (const entry of readdirSync(resolve(root, current), { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = posix.join(current, entry.name);
    if (lstatSync(resolve(root, path)).isSymbolicLink()) throw new Error(`SYMLINK_NOT_ALLOWED:${path}`);
    if (entry.isDirectory()) out.push(...listFiles(root, path));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}
export function boundaryErrors(importer, source, modules) {
  if (!importer.startsWith('src/')) return [];
  const from = importer.split('/')[1];
  const spec = modules.modules[from];
  if (!spec) return [`UNDECLARED_MODULE:${importer}`];
  const errors = [];
  if (/\bimport\s*\(/.test(source)) errors.push(`DYNAMIC_IMPORT_REQUIRES_PARSER:${importer}`);
  const pattern = /\b(?:import|export)\s+(?:[^;\n]*?\sfrom\s*)?["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const target = match[1];
    if (!target.startsWith('.')) {
      if (!(spec.allowed_external ?? []).includes(target)) errors.push(`UNDECLARED_EXTERNAL:${importer}`);
      continue;
    }
    const normalized = posix.normalize(posix.join(posix.dirname(importer), target));
    const parts = normalized.split('/');
    if (parts[0] !== 'src' || !modules.modules[parts[1]]) { errors.push(`OUTSIDE_MODULES:${importer}`); continue; }
    if (parts[1] === from) continue;
    if (!spec.allowed_imports.includes(parts[1])) errors.push(`DISALLOWED_DEPENDENCY:${importer}->${parts[1]}`);
    if (!/^index\.(?:ts|js|mjs)$/.test(parts.at(-1)) || parts.length !== 3) errors.push(`PRIVATE_MODULE_IMPORT:${importer}`);
  }
  return errors;
}
export function secretErrors(path, content) {
  const errors = [];
  if (/\.(?:pem|key|p12|pfx)$|(^|\/)\.env(?:\.|$)|(^|\/)\.dev\.vars(?:\.|$)/.test(path) && !path.endsWith('.example')) errors.push(`SECRET_FILE:${path}`);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) errors.push(`PRIVATE_KEY:${path}`);
  if (/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/.test(content)) errors.push(`GITHUB_CREDENTIAL:${path}`);
  if (/\b(?:CF_API_TOKEN|CLOUDFLARE_API_TOKEN)\s*[:=]\s*["']?[A-Za-z0-9_-]{32,}/.test(content)) errors.push(`CF_CREDENTIAL:${path}`);
  return errors;
}
export function languageErrors(path, content) {
  // Scan text without decoding Unicode escapes used by future locale resources.
  return /\p{Script_Extensions=Arabic}/u.test(content) ? [`NON_ENGLISH_SCRIPT:${path}`] : [];
}
export function contextPack(p) {
  const phase = p.roadmap.phases.find(x => x.id === p.state.phase);
  return { phase: phase.id, status: p.state.phase_status,
    next_task: phase.tasks.find(x => x.id === p.state.next_task),
    resume_action: p.state.resume_action, working_paths: p.state.working_paths,
    blockers: p.state.blockers, acceptance: phase.acceptance, context_files: phase.context_files,
    publication: p.state.publication };
}
export function inputManifest(root = ROOT) {
  return Object.fromEntries(listFiles(root).filter(p => p !== 'STATE.json' && !p.startsWith('evidence/'))
    .map(p => [p, createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex')]));
}
export function verifyEvidence(record, manifest, expected = {}) {
  const errors = [];
  if (record.schema_version !== 1 || !record.phase || !record.created_at_utc) errors.push('EVIDENCE_SCHEMA');
  if (JSON.stringify(record.input_sha256) !== JSON.stringify(manifest)) errors.push('EVIDENCE_INPUT_CHANGED');
  if (!record.checks?.length || record.checks.some(x => x.exit_code !== 0 || x.result !== 'pass')) errors.push('EVIDENCE_CHECK_FAILED');
  if (!record.acceptance?.length || record.acceptance.some(x => x.result !== 'pass')) errors.push('EVIDENCE_ACCEPTANCE');
  if (expected.acceptanceIds) {
    const actual = record.acceptance?.map(x => x.id).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expected.acceptanceIds].sort())) errors.push('EVIDENCE_ACCEPTANCE_IDS');
  }
  if (expected.commands) {
    const actual = record.checks?.map(x => x.command).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expected.commands].sort())) errors.push('EVIDENCE_COMMANDS');
  }
  for (const command of expected.testCommands ?? (expected.testCommand ? [expected.testCommand] : [])) {
    const test = record.checks?.find(x => x.command === command)?.test_counts;
    if (!test || !Number.isSafeInteger(test.executed) || test.executed < 1 || test.failed !== 0 || test.skipped !== 0) errors.push('EVIDENCE_TEST_COUNTS');
  }
  return errors;
}
export function requiredMissing(root = ROOT) { return REQUIRED.filter(p => !existsSync(resolve(root, p))); }

export function verifyLocalP02Evidence(record, manifest, expected) {
  const errors = verifyEvidence(record, manifest, expected).filter(error => error !== 'EVIDENCE_ACCEPTANCE');
  if (record.phase !== 'P02' || record.scope !== 'local_partial' || record.phase_readiness !== 'blocked') errors.push('LOCAL_EVIDENCE_SCOPE');
  const criteria = new Map(record.acceptance?.map(item => [item.id, item.result]));
  if (criteria.get('P02-A1') !== 'pass' || criteria.get('P02-A2') !== 'not_run' || criteria.get('P02-A3') !== 'not_run') errors.push('LOCAL_EVIDENCE_ACCEPTANCE');
  return errors;
}

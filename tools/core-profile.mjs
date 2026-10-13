import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runCommand } from './process.mjs';
import { ROOT, inputManifest } from './project.mjs';

// Fixed work, fixed repetition count; no network destinations except the verified
// optional artifact download. No production CPU/memory threshold is inferred.
const profileId = process.env.ROUTEVELA_PROFILE_ID ?? randomUUID();
const directory = mkdtempSync(resolve(ROOT, '.tmp/core-profile-'));
try {
  const manifest = inputManifest();
  const runs = [];
  for (let index = 0; index < 3; index++) {
    const path = join(directory, `${index}.json`);
    const runId = `${profileId}:${index}`;
    const run = runCommand('node', ['--test-isolation=none', '--import', './tools/resource-observer.mjs',
      '--test', 'tests/core-interop.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, ROUTEVELA_RESOURCE_REPORT: path, ROUTEVELA_RESOURCE_RUN_ID: runId } });
    if (run.status !== 0) throw new Error('CORE_PROFILE_TEST_FAILED');
    const counts = Object.fromEntries(['tests', 'fail', 'skipped'].map(name =>
      [name, Number(run.stdout.match(new RegExp(`(?:\\u2139|#) ${name} (\\d+)`))?.[1] ?? -1)]));
    if (counts.tests < 1 || counts.fail !== 0 || counts.skipped !== 0) throw new Error('CORE_PROFILE_TEST_COUNTS');
    const observation = JSON.parse(readFileSync(path, 'utf8'));
    if (observation.run_id !== runId || observation.exit_code !== 0 || observation.scope !== 'node_test_host_only' ||
      observation.node !== process.version || observation.platform !== process.platform ||
      !['wall_ms', 'cpu_user_ms', 'cpu_system_ms', 'sampled_peak_rss_bytes', 'baseline_rss_bytes',
        'final_rss_bytes', 'baseline_heap_used_bytes', 'final_heap_used_bytes', 'samples']
        .every(key => Number.isFinite(observation[key]) && observation[key] >= 0) || observation.samples < 2) {
      throw new Error('CORE_PROFILE_OBSERVATION_INVALID');
    }
    runs.push({ ...observation, test_counts: { executed: counts.tests, failed: 0, skipped: 0 } });
  }
  if (JSON.stringify(manifest) !== JSON.stringify(inputManifest())) throw new Error('CORE_PROFILE_INPUT_CHANGED');
  const report = { schema_version: 1, profile_id: profileId, created_at_utc: new Date().toISOString(),
    scope: 'node_test_host_only', platform: process.platform, node: process.version,
    input_sha256: manifest, runs,
    limitations: ['Includes test harness, TLS certificate setup and local Node adapters.',
      'Excludes separate sing-box subprocess CPU/RSS, build time and provider/ISP resources.',
      '10 ms RSS sampling can miss brief peaks; no leak, capacity or throughput conclusion is inferred.',
      'Each repetition starts a fresh Node host; repeated sessions run within each host.'] };
  writeFileSync(resolve(ROOT, '.tmp/core-profile.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS: three bounded real-core test repetitions; resource observations saved to .tmp/core-profile.json.');
  for (const run of runs) console.log(`Node host: CPU ${(run.cpu_user_ms + run.cpu_system_ms).toFixed(1)} ms; sampled peak RSS ${(run.sampled_peak_rss_bytes / 1048576).toFixed(1)} MiB; ${run.test_counts.executed} tests passed.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { rmSync(directory, { recursive: true, force: true }); }

import { writeFileSync } from 'node:fs';

// Loaded only by the bounded profile subprocess. Test isolation is disabled so
// this observes the actual Node test host, not an idle test-runner parent.
const destination = process.env.ROUTEVELA_RESOURCE_REPORT;
const runId = process.env.ROUTEVELA_RESOURCE_RUN_ID;
if (!destination || !runId) throw new Error('RESOURCE_OBSERVER_CONTEXT');
const started = process.hrtime.bigint();
const initialCpu = process.cpuUsage();
const baseline = process.memoryUsage();
let peakRss = baseline.rss;
let samples = 1;
const sample = () => { peakRss = Math.max(peakRss, process.memoryUsage.rss()); samples++; };
const timer = setInterval(sample, 10); timer.unref();
process.once('exit', exitCode => {
  clearInterval(timer); sample();
  const cpu = process.cpuUsage(initialCpu);
  const final = process.memoryUsage();
  writeFileSync(destination, JSON.stringify({ run_id: runId, exit_code: exitCode,
    scope: 'node_test_host_only', platform: process.platform, node: process.version,
    wall_ms: Number(process.hrtime.bigint() - started) / 1e6,
    cpu_user_ms: cpu.user / 1000, cpu_system_ms: cpu.system / 1000,
    sampled_peak_rss_bytes: peakRss, baseline_rss_bytes: baseline.rss,
    final_rss_bytes: final.rss, baseline_heap_used_bytes: baseline.heapUsed,
    final_heap_used_bytes: final.heapUsed, samples }) + '\n', { mode: 0o600 });
});

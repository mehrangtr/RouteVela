import http from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { provisionCore, CORE_VERSION } from './core-artifact.mjs';
import { ROOT } from './project.mjs';
import { handleVlessSession } from '../dist/providers/index.js';
import { success, failure } from '../dist/contracts/index.js';
import { securePeer, TEST_SERVER_NAME } from '../tests/tls-helpers.mjs';
import { streamPort, connect, limits } from '../tests/loopback-helpers.mjs';
import { realTimers } from '../tests/connection-helpers.mjs';
import { temporaryConfig, proxyPort, startCore, requestThrough } from '../tests/core-helpers.mjs';

export function labOptions(args) {
  let smoke = false; let durationMs = 60_000;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--smoke' && !smoke) smoke = true;
    else if (args[index] === '--duration-ms' && /^\d+$/.test(args[index + 1] ?? '')) {
      durationMs = Number(args[++index]);
      if (!Number.isSafeInteger(durationMs) || durationMs < 1000 || durationMs > 120_000) throw new Error('LAB_ARGUMENTS');
    } else throw new Error('LAB_ARGUMENTS');
  }
  return { smoke, durationMs };
}

export async function runLab(options, emit = message => console.log(JSON.stringify(message)), observe = () => {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
    Object.keys(options).length !== 2 || typeof options.smoke !== 'boolean' ||
    !Number.isSafeInteger(options.durationMs) || options.durationMs < 1000 || options.durationMs > 120_000) {
    throw new Error('LAB_ARGUMENTS');
  }
  // Async startup must keep the validated lifetime even if a caller later
  // mutates its input object. Only this immutable local snapshot is consulted.
  options = Object.freeze({ smoke: options.smoke, durationMs: options.durationMs });
  const cleanups = []; const scope = { after(action) { cleanups.push(action); } };
  const controller = new AbortController(); const sessions = new Set();
  let active = 0; let completed = 0; let denied = 0; let failed = 0; let stopping = false;
  let stop; const stopped = new Promise(resolve => { stop = resolve; });
  const stopHandler = () => { stopping = true; stop(); };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stopHandler);
  scope.after(() => { for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, stopHandler); });
  try {
    const core = provisionCore(); scope.after(() => core.dispose());
    const version = spawnSync(core.binary, ['version'], { encoding: 'utf8', timeout: 5000 });
    if (version.status !== 0 || !version.stdout.startsWith(`sing-box version ${CORE_VERSION}\n`) &&
      !version.stdout.startsWith(`sing-box version ${CORE_VERSION}\r\n`)) throw new Error('LAB_CORE_VERSION');
    const identity = randomUUID();
    const target = http.createServer({ maxHeaderSize: 4096 }, (request, response) => {
      response.writeHead(request.method === 'GET' && request.url === '/check' ? 200 : 404,
        { Connection: 'close', 'Content-Type': 'text/plain' });
      response.end(request.method === 'GET' && request.url === '/check' ? 'ROUTEVELA_LAB_OK' : 'NOT_FOUND');
    });
    target.maxConnections = 8; target.requestTimeout = 5000; target.headersTimeout = 5000;
    target.listen(0, '127.0.0.1'); await once(target, 'listening');
    scope.after(async () => { target.closeAllConnections(); await new Promise(resolve => target.close(resolve)); });
    const destination = target.address().port;
    // Test-only lifecycle observation has no credentials or key material. An
    // injected startup failure must unwind resources registered before it.
    observe({ stage: 'target_ready', destination_port: destination });
    const access = {
      async authorize(request) { if (request.uuid === identity) return success(undefined); denied++; return failure('RV-AUTH-004'); },
      async dial(address, signal) {
        if (address.kind !== 'ipv4' || address.host !== '127.0.0.1' || address.port !== destination) {
          denied++; return failure('RV-PROTO-001');
        }
        return success(streamPort(await connect(destination, signal)));
      },
    };
    const peer = await securePeer(scope, source => {
      if (stopping || active >= 4) { void source.close().catch(() => {}); return; }
      active++;
      const run = handleVlessSession(source, access, realTimers, limits, controller.signal)
        .then(result => { if (!result.ok) failed++; return result; })
        .finally(() => { active--; completed++; sessions.delete(run); });
      sessions.add(run);
    }, { maxConnections: 8 });
    observe({ stage: 'tls_ready', wss_port: peer.port });
    if (stopping) return;
    const config = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/sing-box.expected.json'), 'utf8'));
    const port = await proxyPort(); config.inbounds[0].listen_port = port;
    const outbound = config.outbounds[0]; outbound.server = '127.0.0.1'; outbound.server_port = peer.port;
    outbound.uuid = identity; outbound.tls.server_name = TEST_SERVER_NAME;
    outbound.tls.certificate = [peer.ca]; outbound.transport.path = '/connect';
    await startCore(scope, core.binary, temporaryConfig(scope, config), port);
    observe({ stage: 'client_ready', http_proxy_port: port });
    if (stopping) return;
    const response = await requestThrough(port, destination, '/check');
    if (response.status !== 200 || response.body !== 'ROUTEVELA_LAB_OK') throw new Error('LAB_SELF_CHECK');
    const outcomes = await Promise.all([...sessions]);
    if (outcomes.some(result => !result.ok) || active !== 0 || failed !== 0) throw new Error('LAB_SESSION_CHECK');
    emit({ event: 'ready', mode: 'loopback_test_only', core: `sing-box ${CORE_VERSION}`,
      http_proxy_port: port, destination_port: destination, wss_port: peer.port,
      duration_ms: options.durationMs, self_check: 'pass' });
    if (!options.smoke) {
      const timer = setTimeout(stopHandler, options.durationMs);
      scope.after(() => clearTimeout(timer));
      process.stdin.on('data', stopHandler); process.stdin.resume();
      scope.after(() => {
        process.stdin.removeListener('data', stopHandler); process.stdin.pause();
      });
      await stopped;
    }
  } finally {
    stopping = true; controller.abort(); await Promise.allSettled([...sessions]);
    const failures = [];
    for (const cleanup of cleanups.reverse()) {
      try { await cleanup(); } catch { failures.push('LAB_CLEANUP'); }
    }
    emit({ event: 'stopped', active_sessions: active, completed_sessions: completed, failed_sessions: failed,
      denied_requests: denied, cleanup: failures.length ? 'fail' : 'pass' });
    if (failures.length) throw new Error('LAB_CLEANUP');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runLab(labOptions(process.argv.slice(2))); }
  catch (error) {
    const code = /^LAB_[A-Z_]+$/.test(error.message ?? '') ? error.message : 'LAB_RUNTIME';
    console.error(JSON.stringify({ event: 'failed', code })); process.exitCode = 1;
  }
}

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { provisionCore, CORE_VERSION } from '../tools/core-artifact.mjs';
import { ROOT } from '../tools/project.mjs';
import { renderProfile } from '../dist/app/index.js';
import { FIXTURE_TARGET } from '../dist/compiler/index.js';
import { handleVlessSession } from '../dist/providers/index.js';
import { realTimers } from './connection-helpers.mjs';
import { limits, accessTo } from './loopback-helpers.mjs';
import { securePeer, TEST_SERVER_NAME } from './tls-helpers.mjs';

let core;
before(() => {
  core = provisionCore();
  const version = spawnSync(core.binary, ['version'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(version.status, 0);
  assert.match(version.stdout, new RegExp(`^sing-box version ${CORE_VERSION.replaceAll('.', '\\.')}\\r?\\n`));
});
after(() => core?.dispose());

function assertSessionSuccess(result) {
  assert.equal(result.ok, true, result.ok ? 'SESSION_OK' : result.error.code);
}

function temporaryConfig(t, config) {
  const directory = mkdtempSync(resolve(ROOT, '.tmp/core-config-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'config.json');
  writeFileSync(path, JSON.stringify(config), { mode: 0o600 });
  return path;
}

test('official pinned core parses the unchanged renderer output', { timeout: 10_000 }, t => {
  const profile = readFileSync(resolve(ROOT, 'tests/fixtures/profile.json'), 'utf8');
  const rendered = renderProfile(profile, { protocols: ['vless'], transports: ['ws'], tls: true }, FIXTURE_TARGET);
  assert.equal(rendered.ok, true);
  const config = temporaryConfig(t, JSON.parse(rendered.value));
  const run = spawnSync(core.binary, ['check', '-c', config], { encoding: 'utf8', timeout: 5000 });
  // No config, UUID, or raw client exception is printed in the report.
  assert.equal(run.status, 0, 'CORE_RENDERED_CONFIG_REJECTED');
});

async function proxyPort() {
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

async function startCore(t, path, port) {
  const child = spawn(core.binary, ['run', '-c', path], { stdio: ['ignore', 'ignore', 'ignore'], shell: false });
  let stopped = false; child.once('error', () => { stopped = true; });
  const exited = new Promise(resolve => child.once('close', () => { stopped = true; resolve(); }));
  t.after(async () => { if (!stopped) child.kill(); await exited; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (stopped) throw new Error('CORE_START_FAILED');
    const ready = await new Promise(resolve => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
    if (ready) return;
    await delay(20);
  }
  throw new Error('CORE_READINESS_TIMEOUT');
}

async function requestThrough(port, destination, path = '/owned-test') {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port,
      path: `http://127.0.0.1:${destination}${path}`, headers: { Connection: 'close' },
      agent: false, timeout: 3000 }, response => {
      const chunks = []; response.on('data', data => chunks.push(data));
      response.once('error', reject);
      response.once('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.once('timeout', () => request.destroy(new Error('CORE_REQUEST_TIMEOUT')));
    request.once('error', reject);
  });
}

for (const scenario of ['permitted', 'denied credential', 'denied destination', 'wrong TLS name', 'byte budget', 'parallel isolation', 'disconnect recovery', 'repeated sessions']) {
  test(`real core VLESS/WSS connection: ${scenario}`, { timeout: 12_000 }, async t => {
    let targetRequests = 0;
    const waiting = [];
    const target = http.createServer((request, response) => {
      targetRequests++;
      if (scenario === 'disconnect recovery') {
        assert.match(request.url, /^\/owned-test\?attempt=[01]$/);
        if (request.url.endsWith('=0')) { sources[0].interrupt(); return; }
        response.writeHead(200, { Connection: 'close' }); response.end('RECOVERED'); return;
      }
      if (scenario === 'repeated sessions') {
        assert.match(request.url, /^\/owned-test\?round=\d+$/);
        response.writeHead(200, { Connection: 'close' }); response.end(`ROUND:${request.url}`); return;
      }
      if (scenario === 'parallel isolation') {
        assert.match(request.url, /^\/owned-test\?session=[0-5]$/);
        waiting.push({ path: request.url, response });
        // Hold every response until all six requests have arrived. This proves
        // overlapping sessions without timing-based concurrency assumptions.
        if (waiting.length === 6) for (const item of waiting) {
          item.response.writeHead(200, { Connection: 'close' });
          item.response.end(item.path.endsWith('=5') ? Buffer.alloc(1024, 65) : `OWNED:${item.path}`);
        }
        return;
      }
      assert.equal(request.url, '/owned-test');
      response.writeHead(200, { Connection: 'close' });
      response.end(scenario === 'byte budget' ? Buffer.alloc(1024, 65) : 'ROUTEVELA_OWNED_RESPONSE');
    });
    target.listen(0, '127.0.0.1'); await once(target, 'listening');
    t.after(async () => { target.closeAllConnections(); await new Promise(resolve => target.close(resolve)); });
    const destination = target.address().port;
    let sessions = 0; let active = 0; let peakActive = 0;
    const peers = []; const outcomes = []; const sources = [];
    const server = await securePeer(t, source => {
      sessions++; active++; peakActive = Math.max(peakActive, active); sources.push(source);
      const sessionLimits = scenario === 'byte budget' ? { ...limits, maxSessionBytes: 256 } :
        scenario === 'parallel isolation' ? { ...limits, maxSessionBytes: 384 } : limits;
      outcomes.push(handleVlessSession(source, accessTo(scenario === 'denied destination' ? destination + 1 : destination, peers), realTimers, sessionLimits)
        .finally(() => { active--; }));
    });
    const config = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/sing-box.expected.json'), 'utf8'));
    const port = await proxyPort(); config.inbounds[0].listen_port = port;
    const outbound = config.outbounds[0];
    // Local test overrides only: generated CA and loopback endpoints. The exact
    // renderer output is separately checked above; production validation stays strict.
    outbound.server = '127.0.0.1'; outbound.server_port = server.port;
    outbound.tls.server_name = scenario === 'wrong TLS name' ? 'wrong.routevela.test' : TEST_SERVER_NAME;
    outbound.tls.certificate = [server.ca]; outbound.transport.path = '/connect';
    if (scenario === 'denied credential') outbound.uuid = '00000000-0000-4000-8000-000000000002';
    await startCore(t, temporaryConfig(t, config), port);
    if (scenario === 'disconnect recovery') {
      const first = await requestThrough(port, destination, '/owned-test?attempt=0').catch(() => ({ status: 0, body: '' }));
      assert.notEqual(first.status, 200);
      const interrupted = await outcomes[0]; assert.equal(interrupted.ok, false);
      assert.equal(interrupted.error.code, 'RV-TRANS-005');
      assert.equal(sources[0].closed, true); assert.equal(peers[0].closed, true);
      const next = await requestThrough(port, destination, '/owned-test?attempt=1');
      assert.deepEqual(next, { status: 200, body: 'RECOVERED' });
      assertSessionSuccess(await outcomes[1]);
      assert.equal(targetRequests, 2); assert.equal(sessions, 2); assert.equal(active, 0);
      assert.ok(sources.every(source => source.closed)); assert.ok(peers.every(peer => peer.closed)); return;
    }
    if (scenario === 'repeated sessions') {
      for (let round = 0; round < 20; round++) {
        const response = await requestThrough(port, destination, `/owned-test?round=${round}`);
        assert.deepEqual(response, { status: 200, body: `ROUND:/owned-test?round=${round}` });
        assertSessionSuccess(await outcomes[round]);
        assert.equal(active, 0); assert.equal(sessions, round + 1); assert.equal(targetRequests, round + 1);
        assert.ok(sources.every(source => source.closed)); assert.ok(peers.every(peer => peer.closed));
      }
      assert.equal(peakActive, 1); return;
    }
    if (scenario === 'parallel isolation') {
      const responses = await Promise.all(Array.from({ length: 6 }, (_, index) =>
        requestThrough(port, destination, `/owned-test?session=${index}`).catch(() => ({ status: 0, body: '' }))));
      const completed = await Promise.all(outcomes);
      for (let index = 0; index < 5; index++) {
        assert.deepEqual(responses[index], { status: 200, body: `OWNED:/owned-test?session=${index}` });
      }
      assert.notDeepEqual(responses[5], { status: 200, body: 'A'.repeat(1024) });
      assert.equal(targetRequests, 6); assert.equal(sessions, 6); assert.equal(peakActive, 6); assert.equal(active, 0);
      assert.equal(completed.filter(result => result.ok).length, 5,
        completed.filter(result => !result.ok).map(result => result.error.code).join(','));
      assert.deepEqual(completed.filter(result => !result.ok).map(result => result.error.code), ['RV-TRANS-008']);
      assert.equal(peers.length, 6);
      assert.ok(peers.every(peer => peer.closed)); assert.ok(sources.every(source => source.closed));
      return;
    }
    const response = await requestThrough(port, destination).catch(() => ({ status: 0, body: '' }));
    const completed = await Promise.all(outcomes);
    if (scenario === 'permitted') {
      assert.deepEqual(response, { status: 200, body: 'ROUTEVELA_OWNED_RESPONSE' });
      assert.equal(targetRequests, 1); assert.equal(sessions, 1);
      assertSessionSuccess(completed[0]); assert.equal(peers[0].closed, true);
    } else if (scenario === 'byte budget') {
      assert.notDeepEqual(response, { status: 200, body: 'A'.repeat(1024) });
      assert.equal(targetRequests, 1); assert.equal(sessions, 1); assert.equal(peers.length, 1);
      assert.equal(completed[0].ok, false); assert.equal(completed[0].error.code, 'RV-TRANS-008');
      assert.equal(peers[0].closed, true);
    } else {
      assert.notEqual(response.status, 200); assert.equal(targetRequests, 0); assert.equal(peers.length, 0);
      assert.equal(sessions, scenario === 'wrong TLS name' ? 0 : 1);
      if (scenario === 'denied credential') assert.equal(completed[0].error.code, 'RV-AUTH-004');
      if (scenario === 'denied destination') assert.equal(completed[0].error.code, 'RV-PROTO-001');
    }
  });
}

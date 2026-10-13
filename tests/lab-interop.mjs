import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { ROOT } from '../tools/project.mjs';
import { provisionCore } from '../tools/core-artifact.mjs';
import { requestThrough } from './core-helpers.mjs';
import { labOptions, runLab } from '../tools/local-lab.mjs';

before(() => { const core = provisionCore(); core.dispose(); });

test('local lab keeps its validated option snapshot across asynchronous startup', { timeout: 15_000 }, async () => {
  const options = labOptions(['--smoke', '--duration-ms', '1000']); const events = [];
  await runLab(options, event => events.push(event), stage => {
    if (stage.stage === 'target_ready') options.durationMs = 120001;
  });
  assert.equal(events[0].self_check, 'pass'); assert.equal(events[0].duration_ms, 1000);
  assert.equal(events.at(-1).cleanup, 'pass'); assert.equal(events.at(-1).active_sessions, 0);
});

async function assertPortClosed(port) {
  await new Promise((done, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); reject(new Error('LAB_PORT_LEFT_OPEN')); });
    socket.once('error', error => error.code === 'ECONNREFUSED' ? done() : reject(new Error('LAB_PORT_CHECK')));
  });
}

async function launch(t, args, action) {
  const before = existsSync(resolve(ROOT, '.tmp')) ? readdirSync(resolve(ROOT, '.tmp')).filter(name => name.startsWith('core-config-')).sort() : [];
  const binariesBefore = existsSync(resolve(ROOT, '.tmp/cores')) ? readdirSync(resolve(ROOT, '.tmp/cores')).filter(name => name.startsWith('verified-')).sort() : [];
  const child = spawn(process.execPath, ['tools/local-lab.mjs', ...args], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = ''; let errors = ''; let buffer = ''; const events = []; let actionRun;
  child.stderr.on('data', data => { errors += data; });
  child.stdout.on('data', data => {
    output += data; buffer += data;
    const lines = buffer.split('\n'); buffer = lines.pop();
    for (const line of lines) {
      const event = JSON.parse(line); events.push(event);
      if (event.event === 'ready' && action) {
        actionRun = Promise.resolve().then(() => action(event, child));
        actionRun.catch(() => child.stdin.write('\n'));
      }
    }
  });
  const [code] = await once(child, 'close');
  await actionRun;
  assert.equal(code, 0, 'LAB_PROCESS_FAILED'); assert.equal(errors, '');
  const ready = events.find(event => event.event === 'ready');
  const stopped = events.find(event => event.event === 'stopped');
  assert.equal(ready.self_check, 'pass'); assert.equal(ready.mode, 'loopback_test_only');
  assert.equal(stopped.cleanup, 'pass'); assert.equal(stopped.active_sessions, 0);
  assert.equal(stopped.failed_sessions, stopped.denied_requests); assert.ok(stopped.completed_sessions >= 1);
  assert.ok(!output.includes('PRIVATE KEY')); assert.ok(!output.includes('"uuid"'));
  assert.deepEqual(readdirSync(resolve(ROOT, '.tmp')).filter(name => name.startsWith('core-config-')).sort(), before);
  assert.deepEqual(readdirSync(resolve(ROOT, '.tmp/cores')).filter(name => name.startsWith('verified-')).sort(), binariesBefore);
  for (const port of [ready.http_proxy_port, ready.wss_port, ready.destination_port]) {
    await assertPortClosed(port);
  }
  return stopped;
}

test('local lab smoke starts a verified core request then removes ports and temporary configuration', { timeout: 15_000 }, t =>
  launch(t, ['--smoke']));
test('local lab lifetime expires with complete owned-resource disposal', { timeout: 15_000 }, t =>
  launch(t, ['--duration-ms', '1000']));
test('local lab supports portable stdin stop with complete owned-resource disposal', { timeout: 15_000 }, t =>
  launch(t, [], (_, child) => child.stdin.write('\n')));

test('local lab accepts manual proxy requests and denies an unrelated owned destination', { timeout: 15_000 }, async t => {
  let foreignRequests = 0;
  const foreign = http.createServer((_, response) => { foreignRequests++; response.end('UNRELATED'); });
  foreign.listen(0, '127.0.0.1'); await once(foreign, 'listening');
  t.after(async () => { foreign.closeAllConnections(); await new Promise(resolve => foreign.close(resolve)); });
  const stopped = await launch(t, [], async (ready, child) => {
    const allowed = await requestThrough(ready.http_proxy_port, ready.destination_port, '/check');
    assert.deepEqual(allowed, { status: 200, body: 'ROUTEVELA_LAB_OK' });
    const denied = await requestThrough(ready.http_proxy_port, foreign.address().port, '/check').catch(() => ({ status: 0 }));
    assert.notEqual(denied.status, 200); assert.equal(foreignRequests, 0); child.stdin.write('\n');
  });
  assert.equal(stopped.denied_requests, 1); assert.equal(stopped.failed_sessions, 1);
});

for (const failureStage of ['target_ready', 'tls_ready', 'client_ready']) {
  test(`local lab unwinds a startup failure at ${failureStage} and permits a fresh run`, { timeout: 15_000 }, async () => {
    const temporary = () => readdirSync(resolve(ROOT, '.tmp')).filter(name => name.startsWith('core-config-')).sort();
    const extracted = () => readdirSync(resolve(ROOT, '.tmp/cores')).filter(name => name.startsWith('verified-')).sort();
    const configsBefore = temporary(); const binariesBefore = extracted();
    const signalCounts = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
    const stages = []; const events = [];
    await assert.rejects(runLab(labOptions(['--smoke']), event => events.push(event), stage => {
      stages.push(stage);
      if (stage.stage === failureStage) throw new Error('LAB_INJECTED_STARTUP_FAILURE');
    }), /LAB_INJECTED_STARTUP_FAILURE/);
    assert.equal(events.some(event => event.event === 'ready'), false);
    assert.equal(events.at(-1).cleanup, 'pass'); assert.equal(events.at(-1).active_sessions, 0);
    for (const stage of stages) for (const [name, port] of Object.entries(stage)) {
      if (name.endsWith('_port')) await assertPortClosed(port);
    }
    assert.deepEqual(temporary(), configsBefore); assert.deepEqual(extracted(), binariesBefore);
    assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), signalCounts);
    const recovered = []; await runLab(labOptions(['--smoke']), event => recovered.push(event));
    assert.equal(recovered[0].self_check, 'pass'); assert.equal(recovered.at(-1).cleanup, 'pass');
    assert.deepEqual(temporary(), configsBefore); assert.deepEqual(extracted(), binariesBefore);
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { handleVlessSession } from '../dist/providers/index.js';
import { requestBytes, realTimers } from './connection-helpers.mjs';

import { limits, streamPort, webSocketPort, tcpServer, connect, accessTo } from './loopback-helpers.mjs';

test('real loopback TCP carries authenticated VLESS bytes and half-closed echo without header leakage', { timeout: 6000 }, async t => {
  let targetBytes = Buffer.alloc(0);
  const destinationPort = await tcpServer(t, socket => {
    socket.on('data', data => { targetBytes = Buffer.concat([targetBytes, data]); socket.write(data); });
    socket.on('end', () => socket.end());
  });
  const peers = []; let completed; const result = new Promise(resolve => { completed = resolve; }); let source;
  const entryPort = await tcpServer(t, socket => {
    source = streamPort(socket);
    void handleVlessSession(source, accessTo(destinationPort, peers), realTimers, limits).then(completed);
  });
  const client = await connect(entryPort); t.after(() => client.destroy());
  const received = []; client.on('data', bytes => received.push(Buffer.from(bytes)));
  const ended = once(client, 'end');
  const payload = Buffer.from('TCP_LOCAL_BODY');
  client.end(requestBytes({ addressType: 1, host: [127, 0, 0, 1], port: destinationPort, payload }));
  await ended;
  const outcome = await result; assert.equal(outcome.ok, true, JSON.stringify({ outcome, source: source.events, peers: peers.map(peer => peer.events) }));
  assert.deepEqual(targetBytes, payload);
  assert.deepEqual(Buffer.concat(received), Buffer.concat([Buffer.from([0, 0]), payload]));
  assert.equal(outcome.value.clientToUpstreamBytes, payload.length);
  assert.equal(source.closed, true); assert.equal(peers.length, 1); assert.equal(peers[0].closed, true);
});

test('real loopback WebSocket message fragments feed the same parser and a TCP peer response', { timeout: 6000 }, async t => {
  const body = Buffer.from('HELLO!'); let targetBytes = Buffer.alloc(0);
  const destinationPort = await tcpServer(t, socket => socket.on('data', data => {
    targetBytes = Buffer.concat([targetBytes, data]);
    if (targetBytes.length === body.length) socket.end(Buffer.from('WS_REPLY'));
  }));
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: limits.maxChunkBytes });
  await once(server, 'listening');
  t.after(async () => { for (const client of server.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); });
  const peers = []; let completed; const result = new Promise(resolve => { completed = resolve; }); let source;
  server.on('connection', ws => {
    source = webSocketPort(ws);
    void handleVlessSession(source, accessTo(destinationPort, peers), realTimers, limits).then(completed);
  });
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`); client.binaryType = 'arraybuffer';
  t.after(() => { if (client.readyState < 2) client.close(); });
  await new Promise((resolve, reject) => {
    client.addEventListener('open', resolve, { once: true });
    client.addEventListener('error', () => reject(new Error('LOCAL_WS_OPEN_FAILED')), { once: true });
  });
  const received = []; client.addEventListener('message', event => received.push(Buffer.from(event.data)));
  const ended = new Promise(resolve => client.addEventListener('close', resolve, { once: true }));
  const header = requestBytes({ addressType: 1, host: [127, 0, 0, 1], port: destinationPort });
  client.send(header.subarray(0, 1)); client.send(header.subarray(1, 18));
  client.send(Buffer.concat([header.subarray(18), body.subarray(0, 5)])); client.send(body.subarray(5));
  await ended;
  const outcome = await result; assert.equal(outcome.ok, true, JSON.stringify({ outcome, source: source.events, peers: peers.map(peer => peer.events) }));
  assert.deepEqual(targetBytes, body);
  assert.deepEqual(Buffer.concat(received), Buffer.concat([Buffer.from([0, 0]), Buffer.from('WS_REPLY')]));
  assert.deepEqual(outcome.value, { clientToUpstreamBytes: body.length, upstreamToClientBytes: 8 });
  assert.equal(source.closed, true); assert.equal(peers[0].closed, true);
});

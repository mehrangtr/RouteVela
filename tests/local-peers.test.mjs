import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { WebSocketServer, createWebSocketStream } from 'ws';
import { handleVlessSession } from '../dist/providers/index.js';
import { failure, success } from '../dist/contracts/index.js';
import { requestBytes, TEST_UUID, realTimers } from './connection-helpers.mjs';

const limits = { maxChunkBytes: 65_536, idleTimeoutMs: 1500, cleanupTimeoutMs: 500,
  maxEmptyReads: 8, maxSessionMs: 4000 };

// Test-only OS adapters: actual sockets and library WebSockets on loopback only.
function streamPort(stream) {
  // Native async iteration observes the readable half's EOF independently. The
  // generic toWeb adapters wait for both Duplex halves and can deadlock an echo.
  const reader = stream.iterator({ destroyOnReturn: false });
  stream.on('error', () => {});
  let closed = false;
  const events = [];
  const operation = async (signal, action) => {
    const abort = () => stream.destroy();
    if (signal.aborted) throw new Error('TEST_PORT_ABORTED');
    signal.addEventListener('abort', abort, { once: true });
    try { return await action(); } finally { signal.removeEventListener('abort', abort); }
  };
  return { events, get closed() { return closed; },
    async read(signal) { events.push('read:start'); return operation(signal, async () => {
      const result = await reader.next(); events.push(result.done ? 'read:eof' : `read:${result.value.byteLength}`);
      return result.done ? null : result.value;
    }); },
    async write(chunk, signal) { events.push(`write:${chunk.byteLength}`); await operation(signal,
      () => new Promise((resolve, reject) => stream.write(chunk, error => error ? reject(error) : resolve()))); events.push('write:done'); },
    async end(signal) { events.push('end:start'); await operation(signal,
      () => new Promise((resolve, reject) => stream.end(error => error ? reject(error) : resolve()))); events.push('end:done'); },
    async close() {
      if (closed) throw new Error('DUPLICATE_TEST_CLOSE'); closed = true;
      const disposed = stream.closed ? Promise.resolve() : once(stream, 'close');
      stream.destroy(); await Promise.all([disposed, reader.return()]);
    },
  };
}

async function tcpServer(t, onConnection) {
  const sockets = new Set();
  const server = net.createServer({ allowHalfOpen: true }, socket => {
    sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket)); onConnection(socket);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  return server.address().port;
}

async function connect(port, signal) {
  const socket = net.createConnection({ host: '127.0.0.1', port, allowHalfOpen: true, signal });
  socket.on('error', () => {}); await once(socket, 'connect'); return socket;
}

function accessTo(port, peers) {
  return {
    async authorize(request) { return request.uuid === TEST_UUID ? success(undefined) : failure('RV-AUTH-004'); },
    async dial(destination, signal) {
      if (destination.kind !== 'ipv4' || destination.host !== '127.0.0.1' || destination.port !== port) return failure('RV-PROTO-001');
      const peer = streamPort(await connect(port, signal)); peers.push(peer); return success(peer);
    },
  };
}

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
    source = streamPort(createWebSocketStream(ws));
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

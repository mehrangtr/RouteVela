import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { streamPort, webSocketPort } from './loopback-helpers.mjs';

test('native port acknowledges an already-finished writer without ending it twice', { timeout: 1000 }, async () => {
  const stream = new PassThrough(); stream.resume();
  await new Promise((resolve, reject) => stream.end(error => error ? reject(error) : resolve()));
  const port = streamPort(stream);
  await port.end(new AbortController().signal);
  assert.ok(!port.events.some(event => event.includes('ERR_STREAM_ALREADY_FINISHED')));
  await port.close(); assert.equal(port.closed, true);
});

test('WebSocket end acknowledges an already-closed peer without waiting for TCP finish', { timeout: 5000 }, async t => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(server, 'listening');
  t.after(async () => { for (const peer of server.clients) peer.terminate(); await new Promise(resolve => server.close(resolve)); });
  const connected = once(server, 'connection');
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`); t.after(() => client.terminate());
  await once(client, 'open'); const [ws] = await connected; const port = webSocketPort(ws);
  const closed = once(ws, 'close'); client.terminate(); await closed;
  assert.equal(ws.readyState, ws.CLOSED);
  await port.end(new AbortController().signal);
  await port.close(); assert.equal(port.closed, true);
});

test('native port does not treat an abruptly destroyed unfinished writer as a graceful end', { timeout: 1000 }, async () => {
  const stream = new PassThrough(); const port = streamPort(stream);
  const closed = new Promise(resolve => stream.once('close', resolve)); stream.destroy(); await closed;
  await assert.rejects(port.end(new AbortController().signal), { code: 'ERR_STREAM_DESTROYED' });
  await port.close(); assert.equal(port.closed, true);
});

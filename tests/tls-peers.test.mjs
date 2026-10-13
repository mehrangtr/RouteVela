import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { handleVlessSession } from '../dist/providers/index.js';
import { requestBytes, realTimers } from './connection-helpers.mjs';
import { tcpServer, accessTo, limits } from './loopback-helpers.mjs';
import { securePeer, TEST_SERVER_NAME } from './tls-helpers.mjs';

test('verified TLS WebSocket relays VLESS to a controlled TCP destination', { timeout: 7000 }, async t => {
  const body = Buffer.from('TLS_LOCAL_BODY'); let targetBytes = Buffer.alloc(0);
  const destination = await tcpServer(t, socket => socket.on('data', data => {
    targetBytes = Buffer.concat([targetBytes, data]);
    if (targetBytes.length === body.length) socket.end(body);
  }));
  let complete; const finished = new Promise(resolve => { complete = resolve; }); const peers = [];
  const server = await securePeer(t, source => {
    void handleVlessSession(source, accessTo(destination, peers), realTimers, limits).then(complete);
  });
  const client = new WebSocket(`wss://127.0.0.1:${server.port}/connect`, {
    ca: server.ca, servername: TEST_SERVER_NAME, rejectUnauthorized: true,
  });
  t.after(() => client.terminate()); await once(client, 'open');
  const chunks = []; client.on('message', data => chunks.push(Buffer.from(data)));
  const closed = once(client, 'close');
  client.send(requestBytes({ addressType: 1, host: [127, 0, 0, 1], port: destination, payload: body }));
  await closed; const outcome = await finished;
  assert.equal(outcome.ok, true); assert.deepEqual(targetBytes, body);
  assert.deepEqual(Buffer.concat(chunks), Buffer.concat([Buffer.from([0, 0]), body]));
  assert.equal(peers[0].closed, true);
});

for (const scenario of ['untrusted CA', 'wrong server name']) {
  test(`TLS rejects ${scenario} before a VLESS session or destination dial`, { timeout: 7000 }, async t => {
    let sessions = 0;
    const server = await securePeer(t, () => { sessions++; });
    const client = new WebSocket(`wss://127.0.0.1:${server.port}/connect`, {
      ...(scenario === 'wrong server name' ? { ca: server.ca } : {}),
      servername: scenario === 'wrong server name' ? 'wrong.routevela.test' : TEST_SERVER_NAME,
      rejectUnauthorized: true,
    });
    t.after(() => client.terminate());
    const error = await new Promise(resolve => client.once('error', resolve));
    assert.equal(error.code, scenario === 'wrong server name' ? 'ERR_TLS_CERT_ALTNAME_INVALID' : 'UNABLE_TO_VERIFY_LEAF_SIGNATURE');
    assert.equal(sessions, 0);
  });
}

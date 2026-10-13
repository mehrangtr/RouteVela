import https from 'node:https';
import { once } from 'node:events';
import selfsigned from 'selfsigned';
import { WebSocketServer } from 'ws';
import { webSocketPort, limits } from './loopback-helpers.mjs';

export const TEST_SERVER_NAME = 'routevela.test';

// Short-lived test identities stay in memory; no system trust store changes.
export async function testIdentity() {
  const options = { keyType: 'ec', curve: 'P-256', algorithm: 'sha256',
    notBeforeDate: new Date(Date.now() - 60_000), notAfterDate: new Date(Date.now() + 3_600_000) };
  const ca = await selfsigned.generate([{ name: 'commonName', value: 'RouteVela local test CA' }], {
    ...options, extensions: [{ name: 'basicConstraints', cA: true, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true }],
  });
  const server = await selfsigned.generate([{ name: 'commonName', value: TEST_SERVER_NAME }], {
    ...options, ca: { key: ca.private, cert: ca.cert },
    extensions: [{ name: 'basicConstraints', cA: false, critical: true },
      { name: 'keyUsage', digitalSignature: true, critical: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: [{ type: 2, value: TEST_SERVER_NAME }] }],
  });
  return { ca: ca.cert, key: server.private, cert: server.cert };
}

export async function securePeer(t, onConnection) {
  const identity = await testIdentity();
  const server = https.createServer({ key: identity.key, cert: identity.cert, minVersion: 'TLSv1.2' });
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('tlsClientError', () => {});
  const ws = new WebSocketServer({ server, path: '/connect', maxPayload: limits.maxChunkBytes,
    perMessageDeflate: false });
  ws.on('connection', socket => {
    onConnection(webSocketPort(socket));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    for (const client of ws.clients) client.terminate();
    for (const socket of sockets) socket.destroy();
    await Promise.all([new Promise(resolve => ws.close(resolve)), new Promise(resolve => server.close(resolve))]);
  });
  return { port: server.address().port, ca: identity.ca };
}

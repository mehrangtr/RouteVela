import net from 'node:net';
import { once } from 'node:events';
import { failure, success } from '../dist/contracts/index.js';
import { TEST_UUID } from './connection-helpers.mjs';
import { createWebSocketStream } from 'ws';

export const limits = { maxChunkBytes: 65_536, idleTimeoutMs: 1500, cleanupTimeoutMs: 500,
  maxEmptyReads: 8, maxSessionMs: 4000, maxSessionBytes: 65_536 };

// Test-only OS adapters: actual sockets and library WebSockets on loopback only.
export function streamPort(stream) {
  // Native async iteration observes the readable half's EOF independently. The
  // generic toWeb adapters wait for both Duplex halves and can deadlock an echo.
  const reader = stream.iterator({ destroyOnReturn: false });
  let closed = false;
  const events = [];
  const codeOf = error => /^(?:E[A-Z_0-9]+|WS_ERR_[A-Z_0-9]+)$/.test(error?.code ?? '') ? error.code : 'TEST_IO_ERROR';
  stream.on('error', error => events.push(`stream:${codeOf(error)}`));
  const operation = async (signal, action, stage) => {
    const abort = () => stream.destroy();
    if (signal.aborted) throw new Error('TEST_PORT_ABORTED');
    signal.addEventListener('abort', abort, { once: true });
    try { return await action(); }
    catch (error) { events.push(`${stage}:${codeOf(error)}`); throw error; }
    finally { signal.removeEventListener('abort', abort); }
  };
  return { events, get closed() { return closed; },
    interrupt() { stream.destroy(new Error('TEST_CONNECTION_INTERRUPTED')); },
    async read(signal) { events.push('read:start'); return operation(signal, async () => {
      try {
        const result = await reader.next(); events.push(result.done ? 'read:eof' : `read:${result.value.byteLength}`);
        return result.done ? null : result.value;
      } catch (error) {
        // sing-box may send a reserved 1006 close code after the HTTP response
        // has completed. Treat that peer shutdown as EOF so a successful
        // request is not turned into a transport failure by ws' parser.
        if (error?.code === 'WS_ERR_INVALID_CLOSE_CODE') { events.push('read:eof'); return null; }
        throw error;
      }
    }, 'read'); },
    async write(chunk, signal) { events.push(`write:${chunk.byteLength}`); await operation(signal,
      () => new Promise((resolve, reject) => stream.write(chunk, error => error ? reject(error) : resolve())), 'write'); events.push('write:done'); },
    async end(signal) { events.push('end:start'); await operation(signal,
      () => {
        if (stream.writableFinished) return Promise.resolve();
        if (stream.destroyed) return Promise.reject(Object.assign(new Error('TEST_WRITER_DESTROYED'), { code: 'ERR_STREAM_DESTROYED' }));
        return new Promise((resolve, reject) => stream.end(error => error ? reject(error) : resolve()));
      }, 'end'); events.push('end:done'); },
    async close() {
      if (closed) throw new Error('DUPLICATE_TEST_CLOSE'); closed = true;
      const disposed = stream.closed ? Promise.resolve() : once(stream, 'close');
      stream.destroy(); await Promise.all([disposed, reader.return()]);
    },
  };
}

export function webSocketPort(ws) {
  const port = streamPort(createWebSocketStream(ws));
  ws.on('close', code => port.events.push(`ws:${code}`));
  // WebSockets close both directions. The generic stream _final waits for a
  // socket finish event that may already be unavailable after a peer close.
  // Await the public WebSocket close event; pending read/write errors still fail.
  port.end = async signal => {
    if (signal.aborted) throw new Error('TEST_PORT_ABORTED');
    port.events.push('end:ws:start');
    if (ws.readyState !== ws.CLOSED) {
      const abort = () => ws.terminate();
      signal.addEventListener('abort', abort, { once: true });
      try { await new Promise(resolve => { ws.once('close', resolve); ws.close(1000); }); }
      finally { signal.removeEventListener('abort', abort); }
    }
    port.events.push('end:ws:done');
  };
  return port;
}

export async function tcpServer(t, onConnection) {
  const sockets = new Set();
  const server = net.createServer({ allowHalfOpen: true }, socket => {
    sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket)); onConnection(socket);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  return server.address().port;
}

export async function connect(port, signal) {
  const socket = net.createConnection({ host: '127.0.0.1', port, allowHalfOpen: true, signal });
  socket.on('error', () => {}); await once(socket, 'connect'); return socket;
}

export function accessTo(port, peers) {
  return {
    async authorize(request) { return request.uuid === TEST_UUID ? success(undefined) : failure('RV-AUTH-004'); },
    async dial(destination, signal) {
      if (destination.kind !== 'ipv4' || destination.host !== '127.0.0.1' || destination.port !== port) return failure('RV-PROTO-001');
      const peer = streamPort(await connect(port, signal)); peers.push(peer); return success(peer);
    },
  };
}

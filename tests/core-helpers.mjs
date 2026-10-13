import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { ROOT } from '../tools/project.mjs';

export function temporaryConfig(t, config) {
  const directory = mkdtempSync(resolve(ROOT, '.tmp/core-config-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'config.json');
  writeFileSync(path, JSON.stringify(config), { mode: 0o600 });
  return path;
}

export async function proxyPort() {
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

export async function startCore(t, binary, path, port) {
  const child = spawn(binary, ['run', '-c', path], { stdio: ['ignore', 'ignore', 'ignore'], shell: false });
  let stopped = false; child.once('error', () => { stopped = true; });
  const exited = new Promise(resolve => child.once('close', () => { stopped = true; resolve(); }));
  t.after(async () => {
    if (!stopped) child.kill();
    const hardStop = setTimeout(() => { if (!stopped) child.kill('SIGKILL'); }, 3000);
    try { await exited; } finally { clearTimeout(hardStop); }
  });
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

export async function requestThrough(port, destination, path = '/owned-test') {
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

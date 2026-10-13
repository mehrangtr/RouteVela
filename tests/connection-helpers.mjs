import { Buffer } from 'node:buffer';

export const TEST_UUID = '00000000-0000-4000-8000-000000000001';
export function requestBytes({ version = 0, command = 1, addons = [], addressType = 2,
  host = 'example.invalid', port = 443, uuid = TEST_UUID, payload = [] } = {}) {
  const id = Buffer.from(uuid.replaceAll('-', ''), 'hex');
  const address = typeof host === 'string' ? Buffer.from(host, 'ascii') : Buffer.from(host);
  return Buffer.concat([Buffer.from([version]), id, Buffer.from([addons.length, ...addons, command, port >> 8, port & 255, addressType]),
    addressType === 2 ? Buffer.from([address.length]) : Buffer.alloc(0), address, Buffer.from(payload)]);
}

export class ManualTimers {
  #now = 0;
  #jobs = new Set();
  after(milliseconds, callback) {
    const job = { at: this.#now + milliseconds, callback }; this.#jobs.add(job);
    return () => this.#jobs.delete(job);
  }
  advance(milliseconds) {
    this.#now += milliseconds;
    for (const job of [...this.#jobs]) {
      if (job.at <= this.#now && this.#jobs.delete(job)) job.callback();
    }
  }
  get pending() { return this.#jobs.size; }
}
export const realTimers = {
  after(milliseconds, callback) { const timer = setTimeout(callback, milliseconds); return () => clearTimeout(timer); },
};
export async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

export class MemoryDuplex {
  constructor(chunks = []) { this.chunks = chunks; this.readCalls = 0; this.written = []; this.ends = 0; this.closes = 0; }
  async read() { this.readCalls++; return this.chunks.shift() ?? null; }
  async write(chunk) { this.written.push(new Uint8Array(chunk)); }
  async end() { this.ends++; }
  async close() { this.closes++; }
}
export const TEST_LIMITS = Object.freeze({ maxChunkBytes: 64, idleTimeoutMs: 100,
  cleanupTimeoutMs: 10, maxEmptyReads: 2, maxSessionMs: 1000, maxSessionBytes: 256 });

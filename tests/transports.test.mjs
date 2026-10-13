import test from 'node:test';
import assert from 'node:assert/strict';
import { relayBytes } from '../dist/transports/index.js';
import { MemoryDuplex, ManualTimers, TEST_LIMITS, flush } from './connection-helpers.mjs';

const fail = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); };
const pending = () => new Promise(() => {});

test('bidirectional relay preserves bytes and drains a response after client half-close', async () => {
  const client = new MemoryDuplex([new Uint8Array([1, 2]), new Uint8Array([3])]);
  const upstream = new MemoryDuplex();
  let reply;
  upstream.read = async () => upstream.ends ? null : await new Promise(resolve => { reply = resolve; });
  upstream.end = async () => { upstream.ends++; reply(new Uint8Array([7, 8])); };
  const timers = new ManualTimers(); const result = await relayBytes(client, upstream, timers, TEST_LIMITS);
  assert.equal(result.ok, true); assert.deepEqual(result.value, { clientToUpstreamBytes: 3, upstreamToClientBytes: 2 });
  assert.deepEqual(upstream.written.map(x => [...x]), [[1, 2], [3]]);
  assert.deepEqual(client.written.map(x => [...x]), [[7, 8]]);
  assert.equal(client.ends, 1); assert.equal(upstream.ends, 1);
  assert.equal(client.closes, 1); assert.equal(upstream.closes, 1); assert.equal(timers.pending, 0);
});

test('backpressure prevents a second read until the first write is acknowledged', async () => {
  const client = new MemoryDuplex([new Uint8Array([1]), new Uint8Array([2])]);
  const upstream = new MemoryDuplex(); const timers = new ManualTimers();
  let acknowledge;
  upstream.write = async chunk => {
    upstream.written.push(new Uint8Array(chunk));
    if (upstream.written.length === 1) await new Promise(resolve => { acknowledge = resolve; });
  };
  const run = relayBytes(client, upstream, timers, TEST_LIMITS); await flush();
  assert.equal(client.readCalls, 1); assert.equal(upstream.written.length, 1);
  acknowledge(); assert.equal((await run).ok, true);
  assert.deepEqual(upstream.written.map(x => [...x]), [[1], [2]]); assert.equal(timers.pending, 0);
});

test('idle timeout aborts stalled reads and a later read completion cannot forward bytes', async () => {
  const client = new MemoryDuplex(); const upstream = new MemoryDuplex(); const timers = new ManualTimers();
  let deliver; client.read = () => new Promise(resolve => { deliver = resolve; }); upstream.read = pending;
  const run = relayBytes(client, upstream, timers, TEST_LIMITS); await flush(); timers.advance(100);
  fail(await run, 'RV-TRANS-001'); deliver(new Uint8Array([9])); await flush();
  assert.equal(upstream.written.length, 0); assert.equal(client.closes, 1); assert.equal(upstream.closes, 1);
  assert.equal(timers.pending, 0);
});

test('successful activity refreshes idle time but never extends the session lifetime', async () => {
  const client = new MemoryDuplex(); const upstream = new MemoryDuplex(); const timers = new ManualTimers();
  let deliver; client.read = () => new Promise(resolve => { deliver = resolve; }); upstream.read = pending;
  const run = relayBytes(client, upstream, timers, { ...TEST_LIMITS, maxSessionMs: 150 }); await flush();
  timers.advance(90); deliver(new Uint8Array([1])); await flush();
  timers.advance(20); await flush(); assert.equal(client.closes, 0);
  timers.advance(40); fail(await run, 'RV-TRANS-001'); assert.equal(timers.pending, 0);
});

test('external and already-aborted cancellation stop work without exposing abort reasons', async () => {
  for (const already of [false, true]) {
    const client = new MemoryDuplex(); const upstream = new MemoryDuplex(); const timers = new ManualTimers();
    client.read = pending; upstream.read = pending; const control = new AbortController();
    if (already) control.abort('SECRET_REASON');
    const run = relayBytes(client, upstream, timers, TEST_LIMITS, control.signal); await flush();
    control.abort('SECRET_REASON'); const result = await run; fail(result, 'RV-TRANS-004');
    assert.ok(!JSON.stringify(result).includes('SECRET')); assert.equal(timers.pending, 0);
    assert.equal(client.closes, 1); assert.equal(upstream.closes, 1);
  }
});

test('oversized frames, empty-read storms and invalid limits fail with bounded cleanup', async () => {
  for (const [chunks, code] of [[[new Uint8Array(65)], 'RV-TRANS-002'],
    [[new Uint8Array(), new Uint8Array(), new Uint8Array()], 'RV-TRANS-003']]) {
    const client = new MemoryDuplex(chunks); const upstream = new MemoryDuplex(); const timers = new ManualTimers();
    fail(await relayBytes(client, upstream, timers, TEST_LIMITS), code);
    assert.equal(upstream.written.length, 0); assert.equal(client.closes, 1); assert.equal(upstream.closes, 1);
  }
  for (const limits of [null, {}, { ...TEST_LIMITS, maxChunkBytes: Infinity }, { ...TEST_LIMITS, cleanupTimeoutMs: 0 },
    ...[undefined, 0, -1, 1.5, Infinity, 1_073_741_825].map(maxSessionBytes => ({ ...TEST_LIMITS, maxSessionBytes }))]) {
    const a = new MemoryDuplex(); const b = new MemoryDuplex(); const timers = new ManualTimers();
    fail(await relayBytes(a, b, timers, limits), 'RV-TRANS-006'); assert.equal(a.readCalls, 0); assert.equal(a.closes, 1);
  }
});

test('write failures abort the other pump without replay or raw exception data', async () => {
  const client = new MemoryDuplex([new Uint8Array([1])]); const upstream = new MemoryDuplex();
  upstream.read = pending; upstream.write = async () => { throw new Error('SECRET_TARGET_AND_TOKEN'); };
  const timers = new ManualTimers(); const result = await relayBytes(client, upstream, timers, TEST_LIMITS);
  fail(result, 'RV-TRANS-005'); assert.ok(!JSON.stringify(result).includes('SECRET'));
  assert.equal(client.readCalls, 1); assert.equal(client.closes, 1); assert.equal(upstream.closes, 1); assert.equal(timers.pending, 0);
});

test('cleanup failures and hanging adapters do not turn an incomplete disposal into success', async () => {
  const a = new MemoryDuplex(); const b = new MemoryDuplex(); const timers = new ManualTimers();
  a.close = async () => { a.closes++; throw new Error('SECRET_CLEANUP'); };
  fail(await relayBytes(a, b, timers, TEST_LIMITS), 'RV-TRANS-007'); assert.equal(b.closes, 1);
  const c = new MemoryDuplex(); const d = new MemoryDuplex(); c.close = pending;
  const run = relayBytes(c, d, timers, TEST_LIMITS); await flush(); timers.advance(10);
  fail(await run, 'RV-TRANS-007'); assert.equal(d.closes, 1); assert.equal(timers.pending, 0);
});

test('combined byte budget permits the exact boundary and rejects the next whole chunk', async () => {
  for (const extra of [false, true]) {
    const client = new MemoryDuplex([new Uint8Array([1, 2]), ...(extra ? [new Uint8Array([3])] : [])]);
    const upstream = new MemoryDuplex([new Uint8Array([7])]); const timers = new ManualTimers();
    const result = await relayBytes(client, upstream, timers, { ...TEST_LIMITS, maxSessionBytes: 3 });
    if (extra) fail(result, 'RV-TRANS-008');
    else { assert.equal(result.ok, true); assert.deepEqual(result.value, { clientToUpstreamBytes: 2, upstreamToClientBytes: 1 }); }
    assert.deepEqual(upstream.written.map(x => [...x]), [[1, 2]]);
    assert.deepEqual(client.written.map(x => [...x]), [[7]]);
    assert.equal(client.closes, 1); assert.equal(upstream.closes, 1); assert.equal(timers.pending, 0);
  }
});

test('simultaneous writes reserve a shared budget before acknowledgements', async () => {
  const client = new MemoryDuplex([new Uint8Array([1, 2, 3])]);
  const upstream = new MemoryDuplex([new Uint8Array([7, 8, 9])]); const timers = new ManualTimers();
  let acknowledge;
  upstream.write = async bytes => { upstream.written.push(new Uint8Array(bytes));
    await new Promise(resolve => { acknowledge = resolve; }); };
  const result = await relayBytes(client, upstream, timers, { ...TEST_LIMITS, maxSessionBytes: 5 });
  fail(result, 'RV-TRANS-008'); assert.equal(client.written.length, 0);
  assert.deepEqual(upstream.written.map(x => [...x]), [[1, 2, 3]]);
  acknowledge(); await flush(); assert.equal(client.readCalls, 1);
  assert.equal(client.closes, 1); assert.equal(upstream.closes, 1); assert.equal(timers.pending, 0);
});

test('initial forwarded bytes consume the relay budget once and invalid seeds perform no I/O', async () => {
  const client = new MemoryDuplex([new Uint8Array([1])]); const upstream = new MemoryDuplex();
  const timers = new ManualTimers();
  const result = await relayBytes(client, upstream, timers, { ...TEST_LIMITS, maxSessionBytes: 3 }, undefined, 2);
  assert.equal(result.ok, true); assert.deepEqual(result.value, { clientToUpstreamBytes: 3, upstreamToClientBytes: 0 });
  for (const seed of [-1, 1.5, 4, Infinity]) {
    const a = new MemoryDuplex(); const b = new MemoryDuplex();
    fail(await relayBytes(a, b, timers, { ...TEST_LIMITS, maxSessionBytes: 3 }, undefined, seed), 'RV-TRANS-006');
    assert.equal(a.readCalls, 0); assert.equal(b.readCalls, 0); assert.equal(a.closes, 1); assert.equal(b.closes, 1);
  }
  assert.equal(timers.pending, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleVlessSession } from '../dist/providers/index.js';
import { success, failure } from '../dist/contracts/index.js';
import { MemoryDuplex, ManualTimers, TEST_LIMITS, requestBytes, TEST_UUID, flush } from './connection-helpers.mjs';

const fail = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); };
const pending = () => new Promise(() => {});

test('VLESS authentication precedes dialing and header/payload reach their proper directions once', async () => {
  const bytes = requestBytes({ payload: [1, 2] });
  const client = new MemoryDuplex([bytes.subarray(0, 3), bytes.subarray(3), new Uint8Array([3])]);
  const peer = new MemoryDuplex([new Uint8Array([8])]); const timers = new ManualTimers(); const calls = [];
  const result = await handleVlessSession(client, {
    async authorize(request) { calls.push('authorize'); assert.equal(request.uuid, TEST_UUID); return success(undefined); },
    async dial(destination) { calls.push('dial'); assert.equal(destination.host, 'example.invalid'); return success(peer); },
  }, timers, TEST_LIMITS);
  assert.equal(result.ok, true); assert.deepEqual(calls, ['authorize', 'dial']);
  assert.deepEqual(client.written.map(x => [...x]), [[0, 0], [8]]);
  assert.deepEqual(peer.written.map(x => [...x]), [[1, 2], [3]]);
  assert.deepEqual(result.value, { clientToUpstreamBytes: 3, upstreamToClientBytes: 1 });
  assert.equal(client.closes, 1); assert.equal(peer.closes, 1); assert.equal(timers.pending, 0);
});

test('denied/expired/revoked credentials never open a target or leak port error context', async () => {
  for (const code of ['RV-AUTH-001', 'RV-AUTH-004', 'RV-AUTH-003']) {
    const client = new MemoryDuplex([requestBytes()]); const timers = new ManualTimers(); let dials = 0;
    const result = await handleVlessSession(client, {
      async authorize() { return { ok: false, error: { code, message: 'SECRET_DETAILS' } }; },
      async dial() { dials++; return success(new MemoryDuplex()); },
    }, timers, TEST_LIMITS);
    fail(result, code); assert.equal(dials, 0); assert.equal(client.written.length, 0);
    assert.ok(!JSON.stringify(result).includes('SECRET')); assert.equal(client.closes, 1); assert.equal(timers.pending, 0);
  }
});

test('malformed/truncated/unsupported headers never invoke authentication or dialing', async () => {
  for (const [chunks, code] of [[[requestBytes().subarray(0, 5)], 'RV-PROTO-002'],
    [[requestBytes({ command: 2 })], 'RV-PROTO-003'], [[requestBytes({ addressType: 99 })], 'RV-PROTO-001']]) {
    const client = new MemoryDuplex(chunks); const timers = new ManualTimers(); let calls = 0;
    fail(await handleVlessSession(client, {
      async authorize() { calls++; return success(undefined); }, async dial() { calls++; return success(new MemoryDuplex()); },
    }, timers, TEST_LIMITS), code);
    assert.equal(calls, 0); assert.equal(client.closes, 1); assert.equal(timers.pending, 0);
  }
});

test('handshake deadline covers stalled input, authorization and connection establishment', async () => {
  for (const stage of ['input', 'authorize', 'dial']) {
    const client = new MemoryDuplex([requestBytes()]); if (stage === 'input') client.read = pending;
    const timers = new ManualTimers();
    const run = handleVlessSession(client, {
      authorize: stage === 'authorize' ? pending : async () => success(undefined),
      dial: stage === 'dial' ? pending : async () => success(new MemoryDuplex()),
    }, timers, TEST_LIMITS, undefined, 50);
    await flush(); timers.advance(50); fail(await run, 'RV-TRANS-001');
    assert.equal(client.closes, 1); assert.equal(client.written.length, 0); assert.equal(timers.pending, 0);
  }
});

test('late connection completion after timeout is disposed rather than becoming a leaked socket', async () => {
  const client = new MemoryDuplex([requestBytes()]); const peer = new MemoryDuplex(); const timers = new ManualTimers();
  let connected;
  const run = handleVlessSession(client, { async authorize() { return success(undefined); },
    dial() { return new Promise(resolve => { connected = resolve; }); } }, timers, TEST_LIMITS, undefined, 50);
  await flush(); timers.advance(50); fail(await run, 'RV-TRANS-001');
  connected(success(peer)); await flush(); assert.equal(peer.closes, 1); assert.equal(client.written.length, 0);
  assert.equal(timers.pending, 0);
});

test('failed connection/reply/body writes close owned ports and never replay initial data', async () => {
  for (const stage of ['dial', 'reply', 'payload']) {
    const client = new MemoryDuplex([requestBytes({ payload: [1, 2] })]); const peer = new MemoryDuplex(); const timers = new ManualTimers();
    if (stage === 'reply') client.write = async () => { throw new Error('SECRET_REPLY'); };
    if (stage === 'payload') peer.write = async () => { throw new Error('SECRET_PAYLOAD'); };
    const result = await handleVlessSession(client, { async authorize() { return success(undefined); },
      async dial() { return stage === 'dial' ? failure('RV-TRANS-005') : success(peer); } }, timers, TEST_LIMITS);
    fail(result, 'RV-TRANS-005'); assert.equal(client.closes, 1); assert.equal(peer.closes, stage === 'dial' ? 0 : 1);
    assert.equal(peer.written.length, 0); assert.ok(!JSON.stringify(result).includes('SECRET')); assert.equal(timers.pending, 0);
  }
});

test('a fresh requested session works after a failure without reusing old stream state', async () => {
  const timers = new ManualTimers();
  const denied = new MemoryDuplex([requestBytes()]);
  fail(await handleVlessSession(denied, { async authorize() { return failure('RV-AUTH-004'); },
    async dial() { throw new Error('must not dial'); } }, timers, TEST_LIMITS), 'RV-AUTH-004');
  const next = new MemoryDuplex([requestBytes()]); const peer = new MemoryDuplex();
  assert.equal((await handleVlessSession(next, { async authorize() { return success(undefined); },
    async dial() { return success(peer); } }, timers, TEST_LIMITS)).ok, true);
  assert.equal(denied.closes, 1); assert.equal(next.closes, 1); assert.equal(peer.closes, 1); assert.equal(timers.pending, 0);
});

test('over-budget initial VLESS payload never authorizes, dials or sends success', async () => {
  const client = new MemoryDuplex([requestBytes({ payload: [1, 2, 3] })]);
  const timers = new ManualTimers(); let calls = 0;
  const result = await handleVlessSession(client, {
    async authorize() { calls++; return success(undefined); },
    async dial() { calls++; return success(new MemoryDuplex()); },
  }, timers, { ...TEST_LIMITS, maxSessionBytes: 2 });
  fail(result, 'RV-TRANS-008'); assert.equal(calls, 0); assert.equal(client.written.length, 0);
  assert.equal(client.closes, 1); assert.equal(timers.pending, 0);
});

test('initial payload and later bytes share one session budget and correct totals', async () => {
  for (const overflow of [false, true]) {
    const client = new MemoryDuplex([requestBytes({ payload: [1, 2] }), new Uint8Array([3])]);
    const peer = new MemoryDuplex(overflow ? [new Uint8Array([8, 9])] : []); const timers = new ManualTimers();
    const result = await handleVlessSession(client, { async authorize() { return success(undefined); },
      async dial() { return success(peer); } }, timers, { ...TEST_LIMITS, maxSessionBytes: 3 });
    if (overflow) fail(result, 'RV-TRANS-008');
    else { assert.equal(result.ok, true); assert.deepEqual(result.value, { clientToUpstreamBytes: 3, upstreamToClientBytes: 0 }); }
    const forwarded = peer.written.reduce((total, bytes) => total + bytes.length, 0) +
      client.written.slice(1).reduce((total, bytes) => total + bytes.length, 0);
    assert.ok(forwarded <= 3); assert.deepEqual([...peer.written[0]], [1, 2]);
    assert.equal(client.closes, 1); assert.equal(peer.closes, 1); assert.equal(timers.pending, 0);
  }
});

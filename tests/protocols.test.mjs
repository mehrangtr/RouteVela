import test from 'node:test';
import assert from 'node:assert/strict';
import { VlessHeaderParser, vlessResponseHeader, MAX_VLESS_HEADER_BYTES, MAX_VLESS_FRAME_BYTES } from '../dist/protocols/index.js';
import { requestBytes, TEST_UUID } from './connection-helpers.mjs';
import { value } from './helpers.mjs';

function fail(result, code) { assert.equal(result.ok, false); assert.equal(result.error.code, code); }

test('wire version 0 TCP handles all fragmentation boundaries without losing fused payload', () => {
  const header = requestBytes(); const body = Buffer.from('CONTROLLED_PAYLOAD');
  for (let split = 0; split <= header.length; split++) {
    const parser = new VlessHeaderParser();
    const first = value(parser.push(header.subarray(0, split)));
    let result;
    if (first.status === 'ready') result = first;
    else result = value(parser.push(Buffer.concat([header.subarray(split), body])));
    assert.equal(result.status, 'ready'); assert.equal(result.request.uuid, TEST_UUID);
    assert.deepEqual(result.request.destination, { kind: 'domain', host: 'example.invalid', port: 443 });
    assert.deepEqual(Buffer.from(result.payload), split === header.length ? Buffer.alloc(0) : body);
    assert.equal(parser.bufferedBytes, 0); assert.equal(parser.finish().ok, true);
  }
});

test('one-byte fragmentation works for IPv4, IPv6 and maximum accepted domain headers', () => {
  const ipv6 = new Uint8Array(16); ipv6[15] = 1;
  const maximum = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(61)].join('.');
  for (const [options, host] of [[{ addressType: 1, host: [127, 0, 0, 1] }, '127.0.0.1'],
    [{ addressType: 3, host: ipv6 }, '0:0:0:0:0:0:0:1'], [{ host: maximum }, maximum]]) {
    const parser = new VlessHeaderParser(); const bytes = requestBytes(options);
    let progress;
    for (const byte of bytes) {
      progress = value(parser.push(new Uint8Array([byte])));
      assert.ok(parser.bufferedBytes <= MAX_VLESS_HEADER_BYTES);
    }
    assert.equal(progress.status, 'ready'); assert.equal(progress.request.destination.host, host);
  }
});

test('every incomplete prefix fails on EOF and no failed parser can be revived', () => {
  const bytes = requestBytes();
  for (let cut = 0; cut < bytes.length; cut++) {
    const parser = new VlessHeaderParser();
    assert.equal(value(parser.push(bytes.subarray(0, cut))).status, 'need_more');
    fail(parser.finish(), 'RV-PROTO-002'); fail(parser.push(bytes), 'RV-PROTO-002');
    assert.equal(parser.bufferedBytes, 0);
  }
});

test('unsupported versions, addons, UDP, Mux and reverse commands fail explicitly', () => {
  for (const options of [{ version: 1 }, { addons: [1] }, { command: 2 }, { command: 3 }, { command: 4 }]) {
    const parser = new VlessHeaderParser(); fail(parser.push(requestBytes(options)), 'RV-PROTO-003');
    fail(parser.push(requestBytes()), 'RV-PROTO-003');
  }
});

test('invalid ports, address types and unsafe/malformed domains never produce destinations', () => {
  for (const options of [{ port: 0 }, { addressType: 99 }, { host: '' }, { host: 'bad..invalid' },
    { host: '-bad.invalid' }, { host: 'a'.repeat(64) + '.invalid' }, { host: 'x'.repeat(254) },
    { host: 'https://example.invalid' }, { host: 'host\n.invalid' }, { host: 'name@host.invalid' }]) {
    fail(new VlessHeaderParser().push(requestBytes(options)), 'RV-PROTO-001');
  }
  const result = value(new VlessHeaderParser().push(requestBytes({ host: 'EXAMPLE.INVALID.' })));
  assert.equal(result.request.destination.host, 'example.invalid');
});

test('frame limits, terminal state and sensitive-data redaction remain enforced', () => {
  fail(new VlessHeaderParser().push(new Uint8Array(MAX_VLESS_FRAME_BYTES + 1)), 'RV-PROTO-004');
  const parser = new VlessHeaderParser(); value(parser.push(requestBytes()));
  fail(parser.push(new Uint8Array([1])), 'RV-PROTO-005');
  const malformed = new VlessHeaderParser().push(requestBytes({ host: 'SECRET\nDESTINATION' }));
  assert.ok(!JSON.stringify(malformed).includes('SECRET')); assert.ok(!JSON.stringify(malformed).includes(TEST_UUID));
});

test('returned payload owns its bytes even when the caller supplies a mutable Node Buffer', () => {
  const bytes = requestBytes({ payload: [8, 9] });
  const result = value(new VlessHeaderParser().push(bytes)); bytes.fill(0);
  assert.deepEqual([...result.payload], [8, 9]);
  assert.throws(() => { result.request.destination.host = 'changed.invalid'; }, TypeError);
});

test('response header is independently owned version 0 with no addons', () => {
  const first = vlessResponseHeader(); first[0] = 99;
  assert.deepEqual([...vlessResponseHeader()], [0, 0]);
});

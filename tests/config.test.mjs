import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseProfile, MAX_PROFILE_BYTES } from '../dist/config/index.js';
import { compileProfile, FIXTURE_TARGET } from '../dist/compiler/index.js';
import { renderProfile } from '../dist/app/index.js';
import { value } from './helpers.mjs';

const source = readFileSync(new URL('fixtures/profile.json', import.meta.url), 'utf8');
const fixture = JSON.parse(source);
const capabilities = { protocols: ['vless'], transports: ['ws'], tls: true };
const parse = data => parseProfile(JSON.stringify(data), capabilities);
const error = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); };

test('malformed, oversized and multibyte inputs are rejected with stage-specific safe codes', () => {
  error(parseProfile('{', capabilities), 'RV-CONFIG-001');
  error(parseProfile(' '.repeat(MAX_PROFILE_BYTES + 1), capabilities), 'RV-CONFIG-005');
  error(parse({ ...fixture, id: '\u6f22'.repeat(3000) }), 'RV-CONFIG-005');
  for (const data of [null, [], 'not-a-profile', { ...fixture, surprise: 'SECRET_URL' },
    { ...fixture, schemaVersion: 2 }, { ...fixture, port: '443' }, { ...fixture, credential: null },
    { ...fixture, credential: { ...fixture.credential, adminToken: 'SECRET_TOKEN' } },
    { ...fixture, tls: 'true' }]) error(parse(data), 'RV-CONFIG-002');
  error(parseProfile(source.replace('"id":', '"__proto__": {"polluted":true}, "id":'), capabilities), 'RV-CONFIG-002');
  assert.equal({}.polluted, undefined);
});

test('semantic validation rejects unsafe endpoint, TLS, path and credential values', () => {
  for (const server of ['https://example.invalid', '127.0.0.1', 'localhost', 'a..invalid', '-bad.invalid', 'example.invalid.', 'name@host.invalid']) {
    error(parse({ ...fixture, server }), 'RV-CONFIG-003');
  }
  for (const port of [0, 65536, 443.5]) error(parse({ ...fixture, port }), 'RV-CONFIG-003');
  for (const path of ['https://other.invalid', '//other.invalid', '/a/../b', '/%2e%2e', '/%252e%252e', '/%0a', '/%250a', '/a?token=x', '/a#fragment', '/%', '/a\\b']) {
    error(parse({ ...fixture, path }), 'RV-CONFIG-003');
  }
  error(parse({ ...fixture, tls: false }), 'RV-CONFIG-003');
  error(parse({ ...fixture, credential: { ...fixture.credential, purpose: 'admin' } }), 'RV-CONFIG-003');
  for (const generation of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    error(parse({ ...fixture, credential: { ...fixture.credential, generation } }), 'RV-CONFIG-003');
  }
  error(parse({ ...fixture, credential: { ...fixture.credential, uuid: 'SECRET_NOT_UUID' } }), 'RV-CONFIG-003');
});

test('capability absence and unimplemented protocols/transports never produce config output', () => {
  for (const caps of [{ ...capabilities, protocols: [] }, { ...capabilities, transports: [] }, { ...capabilities, tls: false }]) {
    error(parseProfile(source, caps), 'RV-CONFIG-004');
  }
  error(parse({ ...fixture, protocol: 'trojan' }), 'RV-CONFIG-004');
  error(parse({ ...fixture, transport: 'udp' }), 'RV-CONFIG-004');
  error(renderProfile(source, capabilities, { family: 'Mihomo', version: '1' }), 'RV-CLIENT-001');
  error(renderProfile(source, capabilities, { ...FIXTURE_TARGET, version: 'latest' }), 'RV-CLIENT-001');
});

test('validated data is detached and immutable; forged or modified objects cannot bypass the compiler', () => {
  const original = structuredClone(fixture);
  const profile = value(parse(original)); original.server = 'changed.invalid';
  assert.equal(profile.server, fixture.server);
  assert.throws(() => { profile.server = 'changed.invalid'; }, TypeError);
  assert.throws(() => { profile.credential.uuid = 'changed'; }, TypeError);
  error(compileProfile(fixture, FIXTURE_TARGET), 'RV-CONFIG-002');
  error(compileProfile({ ...profile, tls: false }, FIXTURE_TARGET), 'RV-CONFIG-002');
});

test('the composed pipeline produces the reviewed fixture byte-for-byte independent of key order', () => {
  const expected = readFileSync(new URL('fixtures/sing-box.expected.json', import.meta.url), 'utf8');
  assert.equal(value(renderProfile(source, capabilities, FIXTURE_TARGET)), expected);
  const reordered = Object.fromEntries(Object.entries(fixture).reverse());
  reordered.credential = Object.fromEntries(Object.entries(fixture.credential).reverse());
  assert.equal(value(renderProfile(JSON.stringify(reordered), capabilities, FIXTURE_TARGET)), expected);
  const uppercase = { ...fixture, server: fixture.server.toUpperCase(), serverName: fixture.serverName.toUpperCase() };
  assert.equal(value(renderProfile(JSON.stringify(uppercase), capabilities, FIXTURE_TARGET)), expected);
  const parsed = JSON.parse(expected);
  assert.equal(parsed.inbounds[0].listen, '127.0.0.1');
  assert.equal(parsed.outbounds[0].tls.enabled, true);
  assert.equal(Object.hasOwn(parsed.outbounds[0].tls, 'insecure'), false);
});

test('profile failures expose no supplied name, endpoint, connection secret or URL', () => {
  const result = parse({ ...fixture, server: 'SECRET_SUBSCRIPTION_URL', credential: { ...fixture.credential, uuid: 'SECRET_CONNECTION_VALUE' } });
  assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes('SECRET_'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createUser, registerUser, evaluateUserPolicy, evaluateCredentialPolicy } from '../dist/domain/index.js';
import { diagnosticError, ERROR_CATALOG } from '../dist/contracts/index.js';
import { FakeClock, FakeRandom, MemoryUsers, value } from './helpers.mjs';

const input = { name: 'Example user', expiresAt: 2_000 };
const error = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); };

test('user expiry is exact, indefinite expiry works, and disabled access is refused', () => {
  const clock = new FakeClock();
  const user = value(createUser(input, clock, new FakeRandom()));
  clock.advance(999); assert.equal(evaluateUserPolicy(user, clock).ok, true);
  clock.advance(1); error(evaluateUserPolicy(user, clock), 'RV-AUTH-001');
  assert.equal(evaluateUserPolicy({ ...user, expiresAt: null }, clock).ok, true);
  error(evaluateUserPolicy({ ...user, status: 'disabled' }, clock), 'RV-AUTH-002');
  assert.throws(() => { user.status = 'disabled'; }, TypeError);
});

test('invalid clock, expiry, random source and empty/oversized names fail safely', () => {
  for (const now of [NaN, Infinity, -1, 1.5]) error(createUser(input, new FakeClock(now), new FakeRandom()), 'RV-CORE-001');
  error(createUser(input, { now() { throw new Error('private clock data'); } }, new FakeRandom()), 'RV-CORE-001');
  error(createUser(input, new FakeClock(), new FakeRandom('not-a-uuid')), 'RV-CORE-002');
  error(createUser(input, new FakeClock(), { uuid() { throw new Error('private randomness data'); } }), 'RV-CORE-002');
  for (const data of [{ name: ' ', expiresAt: null }, { name: 'x'.repeat(257), expiresAt: null },
    { name: 'bad\nname', expiresAt: null }, { ...input, expiresAt: 1_000 }, { ...input, expiresAt: NaN }]) {
    error(createUser(data, new FakeClock(), new FakeRandom()), 'RV-USER-001');
  }
  assert.equal(value(createUser({ name: '\u0633\u0644\u0627\u0645', expiresAt: null }, new FakeClock(), new FakeRandom())).name, '\u0633\u0644\u0627\u0645');
});

test('atomic repository insertion refuses collisions and errors never expose backend details', async () => {
  const repository = new MemoryUsers();
  const clock = new FakeClock(); const random = new FakeRandom();
  const outcomes = await Promise.all([registerUser(input, clock, random, repository), registerUser(input, clock, random, repository)]);
  assert.equal(outcomes.filter(result => result.ok).length, 1);
  error(outcomes.find(result => !result.ok), 'RV-CORE-004');
  assert.equal((await repository.findById(random.id)).name, input.name);
  const failed = await registerUser(input, clock, random, { async insert() { throw new Error('SECRET_BACKEND_PASSWORD'); } });
  error(failed, 'RV-CORE-003');
  assert.ok(!JSON.stringify(failed).includes('SECRET_BACKEND_PASSWORD'));
});

test('credential policies separate purpose/owner and enforce generation, revocation and expiry', () => {
  const clock = new FakeClock(); const user = value(createUser(input, clock, new FakeRandom()));
  const credential = { userId: user.id, purpose: 'connection', generation: 2, issuedAt: 1_000, expiresAt: 1_500, revokedAt: null };
  assert.equal(evaluateCredentialPolicy(user, credential, 'connection', 2, clock).ok, true);
  error(evaluateCredentialPolicy(user, credential, 'subscription', 2, clock), 'RV-AUTH-003');
  error(evaluateCredentialPolicy(user, { ...credential, purpose: 'admin' }, 'connection', 2, clock), 'RV-AUTH-003');
  error(evaluateCredentialPolicy(user, { ...credential, userId: 'another-user' }, 'connection', 2, clock), 'RV-AUTH-003');
  for (const current of [1, 3]) error(evaluateCredentialPolicy(user, credential, 'connection', current, clock), 'RV-AUTH-004');
  error(evaluateCredentialPolicy(user, { ...credential, revokedAt: 1_000 }, 'connection', 2, clock), 'RV-AUTH-004');
  for (const generation of [0, NaN, 2.1]) error(evaluateCredentialPolicy(user, { ...credential, generation }, 'connection', 2, clock), 'RV-USER-001');
  clock.advance(500); error(evaluateCredentialPolicy(user, credential, 'connection', 2, clock), 'RV-AUTH-001');
  clock.time = 999; error(evaluateCredentialPolicy(user, credential, 'connection', 2, clock), 'RV-USER-001');
});

test('diagnostics rebuild only catalog fields rather than retaining tokens or exception context', () => {
  assert.throws(() => { ERROR_CATALOG['RV-AUTH-004'].message = 'SECRET_TAMPER'; }, TypeError);
  const safe = diagnosticError({ code: 'RV-AUTH-004', message: 'SECRET_CONTEXT', url: 'SECRET_LINK', token: 'SECRET_TOKEN' });
  assert.ok(!JSON.stringify(safe).includes('SECRET_'));
  assert.deepEqual(Object.keys(safe).sort(), ['code', 'module', 'stage', 'retryable', 'message', 'action'].sort());
  for (const unknown of [new Error('SECRET_FAILURE'), { code: 'SECRET_UNKNOWN' }, null,
    { get code() { throw new Error('SECRET_ACCESSOR'); } }]) {
    const result = diagnosticError(unknown);
    assert.equal(result.code, 'RV-CORE-005'); assert.ok(!JSON.stringify(result).includes('SECRET_'));
  }
});

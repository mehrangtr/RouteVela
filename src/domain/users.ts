import { failure, success, isTimestamp, UUID_V4 } from '../contracts/index.js';
import type { Clock, RandomSource, Result, UserRecord, UserRepository, CredentialRecord } from '../contracts/index.js';

export interface NewUser {
  readonly name: string;
  readonly expiresAt: number | null;
}

function observation(clock: Clock): Result<number> {
  try {
    const now = clock.now();
    return isTimestamp(now) ? success(now) : failure('RV-CORE-001');
  } catch {
    return failure('RV-CORE-001');
  }
}

export function createUser(input: NewUser, clock: Clock, random: RandomSource): Result<UserRecord> {
  const time = observation(clock);
  if (!time.ok) return time;
  if (typeof input.name !== 'string' || !input.name.trim() ||
    new TextEncoder().encode(input.name).length > 256 || /[\u0000-\u001f\u007f]/u.test(input.name) ||
    (input.expiresAt !== null && (!isTimestamp(input.expiresAt) || input.expiresAt <= time.value))) {
    return failure('RV-USER-001');
  }
  let id: string;
  try { id = random.uuid(); } catch { return failure('RV-CORE-002'); }
  if (typeof id !== 'string' || !UUID_V4.test(id)) return failure('RV-CORE-002');
  return success(Object.freeze({ id: id.toLowerCase(), name: input.name.trim(), status: 'active',
    createdAt: time.value, expiresAt: input.expiresAt }));
}

export async function registerUser(input: NewUser, clock: Clock, random: RandomSource,
  repository: UserRepository): Promise<Result<UserRecord>> {
  const user = createUser(input, clock, random);
  if (!user.ok) return user;
  try {
    return await repository.insert(user.value) ? user : failure('RV-CORE-004');
  } catch {
    return failure('RV-CORE-003');
  }
}

function userPolicy(user: UserRecord, now: number): Result<void> {
  if (!UUID_V4.test(user.id) || !isTimestamp(user.createdAt) || user.createdAt > now ||
    (user.status !== 'active' && user.status !== 'disabled') ||
    (user.expiresAt !== null && (!isTimestamp(user.expiresAt) || user.expiresAt <= user.createdAt))) {
    return failure('RV-USER-001');
  }
  if (user.status === 'disabled') return failure('RV-AUTH-002');
  if (user.expiresAt !== null && now >= user.expiresAt) return failure('RV-AUTH-001');
  return success(undefined);
}

export function evaluateUserPolicy(user: UserRecord, clock: Clock): Result<void> {
  const time = observation(clock);
  return time.ok ? userPolicy(user, time.value) : time;
}

// This checks trusted metadata, not a secret/signature. Cryptographic verification
// and durable revocation storage must be added at their own boundaries later.
export function evaluateCredentialPolicy(user: UserRecord, credential: CredentialRecord,
  purpose: 'subscription' | 'connection', currentGeneration: number, clock: Clock): Result<void> {
  const time = observation(clock);
  if (!time.ok) return time;
  const access = userPolicy(user, time.value);
  if (!access.ok) return access;
  if ((purpose !== 'subscription' && purpose !== 'connection') || credential.userId !== user.id ||
    credential.purpose !== purpose) return failure('RV-AUTH-003');
  if (!Number.isSafeInteger(credential.generation) || credential.generation < 1 ||
    !Number.isSafeInteger(currentGeneration) || currentGeneration < 1 ||
    !isTimestamp(credential.issuedAt) || credential.issuedAt < user.createdAt || credential.issuedAt > time.value ||
    (credential.expiresAt !== null && (!isTimestamp(credential.expiresAt) || credential.expiresAt <= credential.issuedAt))) {
    return failure('RV-USER-001');
  }
  if (credential.revokedAt !== null || credential.generation !== currentGeneration) return failure('RV-AUTH-004');
  if (credential.expiresAt !== null && time.value >= credential.expiresAt) return failure('RV-AUTH-001');
  return success(undefined);
}

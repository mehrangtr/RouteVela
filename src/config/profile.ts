import { failure, success, UUID_V4 } from '../contracts/index.js';
import type { ConnectionProfile, Result, RuntimeCapabilities } from '../contracts/index.js';

export const MAX_PROFILE_BYTES = 8192;
declare const profileBrand: unique symbol;
export type ValidatedProfile = ConnectionProfile & { readonly [profileBrand]: true };
const validated = new WeakSet<object>();

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}
function hostname(value: string): boolean {
  // ASCII DNS names only in the first fixture; IP literals/IDNs need explicit support.
  if (value.length > 253 || !value.includes('.')) return false;
  return value.split('.').every(label => label.length > 0 && label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)) && !/^\d+(?:\.\d+){3}$/.test(value);
}
function path(value: string): boolean {
  if (value.length > 512 || !value.startsWith('/') || value.startsWith('//') ||
    /[\u0000-\u0020\u007f\\?#]/u.test(value) || /%(?![0-9a-f]{2})/i.test(value)) return false;
  try {
    // Ban encoded controls and traversal, including repeated encoding and dot segments.
    let decoded = value;
    for (let round = 0; round < 3; round++) {
      const next = decodeURIComponent(decoded);
      if (/[\u0000-\u0020\u007f\\?#]/u.test(next) || next.startsWith('//') ||
        next.split('/').some(segment => segment === '.' || segment === '..')) return false;
      if (next === decoded) return true;
      decoded = next;
    }
    return !decoded.includes('%');
  } catch { return false; }
}

export function parseProfile(source: string, capabilities: RuntimeCapabilities): Result<ValidatedProfile> {
  if (typeof source !== 'string') return failure('RV-CONFIG-002');
  // A short code-unit check avoids allocating an encoder buffer for enormous inputs.
  if (source.length > MAX_PROFILE_BYTES || new TextEncoder().encode(source).length > MAX_PROFILE_BYTES) return failure('RV-CONFIG-005');
  let input: unknown;
  try { input = JSON.parse(source) as unknown; } catch { return failure('RV-CONFIG-001'); }
  if (!object(input) || !keys(input, ['schemaVersion', 'id', 'protocol', 'transport', 'server', 'port', 'tls', 'serverName', 'path', 'credential']) ||
    input.schemaVersion !== 1 || typeof input.id !== 'string' || typeof input.protocol !== 'string' ||
    typeof input.transport !== 'string' || typeof input.server !== 'string' || typeof input.port !== 'number' ||
    typeof input.tls !== 'boolean' || typeof input.serverName !== 'string' || typeof input.path !== 'string' ||
    !object(input.credential) || !keys(input.credential, ['purpose', 'uuid', 'generation']) ||
    typeof input.credential.purpose !== 'string' || typeof input.credential.uuid !== 'string' ||
    typeof input.credential.generation !== 'number') return failure('RV-CONFIG-002');
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(input.id) || !hostname(input.server) ||
    !Number.isInteger(input.port) || input.port < 1 || input.port > 65535 || !hostname(input.serverName) ||
    !path(input.path) || input.tls !== true || input.credential.purpose !== 'connection' ||
    !UUID_V4.test(input.credential.uuid) || !Number.isSafeInteger(input.credential.generation) || input.credential.generation < 1) {
    return failure('RV-CONFIG-003');
  }
  if (input.protocol !== 'vless' || input.transport !== 'ws' || !capabilities.tls ||
    !capabilities.protocols.includes(input.protocol) || !capabilities.transports.includes(input.transport)) return failure('RV-CONFIG-004');
  const profile = Object.freeze({ schemaVersion: 1 as const, id: input.id, protocol: input.protocol,
    transport: input.transport, server: input.server.toLowerCase(), port: input.port, tls: input.tls,
    serverName: input.serverName.toLowerCase(), path: input.path,
    credential: Object.freeze({ purpose: 'connection' as const, uuid: input.credential.uuid.toLowerCase(), generation: input.credential.generation }) });
  validated.add(profile);
  return success(profile as ValidatedProfile);
}

export function isValidatedProfile(value: unknown): value is ValidatedProfile {
  return object(value) && validated.has(value);
}

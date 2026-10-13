export interface Clock { now(): number }
export interface RandomSource { uuid(): string }

export interface UserRecord {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'disabled';
  readonly createdAt: number;
  readonly expiresAt: number | null;
}

export type CredentialPurpose = 'admin' | 'subscription' | 'connection' | 'installer';
export interface CredentialRecord {
  readonly userId: string;
  readonly purpose: CredentialPurpose;
  readonly generation: number;
  readonly issuedAt: number;
  readonly expiresAt: number | null;
  readonly revokedAt: number | null;
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  // Implementations must atomically refuse collisions; this never overwrites a user.
  insert(user: UserRecord): Promise<boolean>;
}

export interface RuntimeCapabilities {
  readonly protocols: readonly string[];
  readonly transports: readonly string[];
  readonly tls: boolean;
}

export interface ConnectionProfile {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly protocol: 'vless';
  readonly transport: 'ws';
  readonly server: string;
  readonly port: number;
  readonly tls: true;
  readonly serverName: string;
  readonly path: string;
  readonly credential: Readonly<{
    purpose: 'connection';
    uuid: string;
    generation: number;
  }>;
}

// v4 UUID format is not evidence that an injected source is cryptographically secure.
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
}

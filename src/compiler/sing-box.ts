import { failure, success } from '../contracts/index.js';
import type { Result } from '../contracts/index.js';
import { isValidatedProfile } from '../config/index.js';
import type { ValidatedProfile } from '../config/index.js';

export const FIXTURE_TARGET = Object.freeze({ family: 'sing-box', version: '1.12.0' } as const);
export interface ClientTarget { readonly family: string; readonly version: string }

// This target is a deterministic P01 schema fixture, not a P03 client compatibility claim.
export function compileProfile(profile: ValidatedProfile, target: ClientTarget): Result<string> {
  if (!isValidatedProfile(profile)) return failure('RV-CONFIG-002');
  if (target.family !== FIXTURE_TARGET.family || target.version !== FIXTURE_TARGET.version) return failure('RV-CLIENT-001');
  return success(JSON.stringify({
    log: { disabled: true },
    inbounds: [{ type: 'mixed', tag: 'local', listen: '127.0.0.1', listen_port: 1080 }],
    outbounds: [{ type: 'vless', tag: profile.id, server: profile.server, server_port: profile.port,
      uuid: profile.credential.uuid,
      tls: { enabled: true, server_name: profile.serverName },
      transport: { type: 'ws', path: profile.path } }],
    route: { final: profile.id, auto_detect_interface: true },
  }, null, 2) + '\n');
}

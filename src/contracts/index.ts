export { ERROR_CATALOG, success, failure, diagnosticError } from './errors.js';
export type { ErrorCode, SafeError, Result } from './errors.js';
export { UUID_V4, isTimestamp } from './model.js';
export type {
  Clock, RandomSource, UserRecord, CredentialPurpose, CredentialRecord,
  UserRepository, RuntimeCapabilities, ConnectionProfile,
} from './model.js';
export type { TcpDestination, VlessRequest, HeaderProgress, ByteDuplex, Timers,
  RelayLimits, RelayStats, ConnectionAccess } from './connection.js';

export const ERROR_CATALOG = Object.freeze({
  'RV-CONFIG-001': { module: 'config', stage: 'parse', retryable: false, message: 'Invalid JSON.', action: 'Provide a valid JSON profile.' },
  'RV-CONFIG-002': { module: 'config', stage: 'schema', retryable: false, message: 'Invalid profile shape.', action: 'Use the documented profile fields and types.' },
  'RV-CONFIG-003': { module: 'config', stage: 'semantic', retryable: false, message: 'Invalid profile values.', action: 'Review endpoint, TLS, path and credential constraints.' },
  'RV-CONFIG-004': { module: 'config', stage: 'capability', retryable: false, message: 'Unsupported profile capability.', action: 'Choose a supported protocol, transport and TLS capability.' },
  'RV-CONFIG-005': { module: 'config', stage: 'parse', retryable: false, message: 'Profile exceeds the input budget.', action: 'Reduce profile size before importing.' },
  'RV-AUTH-001': { module: 'domain', stage: 'expiry', retryable: false, message: 'Access has expired.', action: 'Ask the owner to renew access.' },
  'RV-AUTH-002': { module: 'domain', stage: 'status', retryable: false, message: 'User is disabled.', action: 'Ask the owner to review user status.' },
  'RV-AUTH-003': { module: 'domain', stage: 'purpose', retryable: false, message: 'Credential purpose or owner does not match.', action: 'Use the credential assigned to this operation.' },
  'RV-AUTH-004': { module: 'domain', stage: 'revocation', retryable: false, message: 'Credential is revoked or obsolete.', action: 'Obtain a current credential from the owner.' },
  'RV-CORE-001': { module: 'domain', stage: 'clock', retryable: false, message: 'Invalid clock observation.', action: 'Restore a valid clock before granting access.' },
  'RV-CORE-002': { module: 'domain', stage: 'identity', retryable: false, message: 'Invalid identity source.', action: 'Use a cryptographically secure UUID source.' },
  'RV-CORE-003': { module: 'domain', stage: 'storage', retryable: true, message: 'Repository operation failed.', action: 'Check storage readiness and retry within a bounded budget.' },
  'RV-CORE-004': { module: 'domain', stage: 'identity', retryable: false, message: 'Identity already exists.', action: 'Retry with a new identity; do not overwrite the existing user.' },
  'RV-CORE-005': { module: 'core', stage: 'unexpected', retryable: false, message: 'An unexpected operation failed.', action: 'Report the safe code without sending secrets or raw exceptions.' },
  'RV-CLIENT-001': { module: 'compiler', stage: 'target', retryable: false, message: 'Unsupported client target.', action: 'Select a documented fixture target; live compatibility still needs testing.' },
  'RV-USER-001': { module: 'domain', stage: 'validation', retryable: false, message: 'Invalid user or credential metadata.', action: 'Review identity, status, timestamps and generation.' },
  'RV-PROTO-001': { module: 'protocols', stage: 'header', retryable: false, message: 'Invalid protocol header.', action: 'Use a supported VLESS version-0 TCP request.' },
  'RV-PROTO-002': { module: 'protocols', stage: 'header', retryable: false, message: 'Protocol header is truncated.', action: 'Send the complete header before closing the stream.' },
  'RV-PROTO-003': { module: 'protocols', stage: 'capability', retryable: false, message: 'Unsupported protocol version, command or addon.', action: 'Use version 0, TCP and no flow addons.' },
  'RV-PROTO-004': { module: 'protocols', stage: 'budget', retryable: false, message: 'Protocol input exceeds the frame budget.', action: 'Use bounded frames.' },
  'RV-PROTO-005': { module: 'protocols', stage: 'state', retryable: false, message: 'Header parser already completed.', action: 'Forward later bytes through the transport, not the header parser.' },
  'RV-TRANS-001': { module: 'transports', stage: 'timeout', retryable: true, message: 'Connection operation timed out.', action: 'Review reachability and retry with a fresh session within a bounded budget.' },
  'RV-TRANS-002': { module: 'transports', stage: 'budget', retryable: false, message: 'Stream frame exceeds the buffer budget.', action: 'Reduce frame size or use a bounded adapter.' },
  'RV-TRANS-003': { module: 'transports', stage: 'progress', retryable: false, message: 'Stream produced too many empty reads.', action: 'Review the transport adapter.' },
  'RV-TRANS-004': { module: 'transports', stage: 'cancel', retryable: false, message: 'Connection was cancelled.', action: 'Start a fresh session only when requested.' },
  'RV-TRANS-005': { module: 'transports', stage: 'io', retryable: true, message: 'Connection I/O failed.', action: 'Review the safe stage and use a fresh session; do not replay partial writes automatically.' },
  'RV-TRANS-006': { module: 'transports', stage: 'limits', retryable: false, message: 'Invalid connection limits.', action: 'Use finite positive bounded limits.' },
  'RV-TRANS-007': { module: 'transports', stage: 'cleanup', retryable: false, message: 'Connection cleanup failed or timed out.', action: 'Dispose the transport adapter before opening another session.' },
  'RV-TRANS-008': { module: 'transports', stage: 'budget', retryable: false, message: 'Session forwarding budget exhausted.', action: 'Review the permitted session budget; no automatic replay or reconnect is performed.' },
} as const);
for (const entry of Object.values(ERROR_CATALOG)) Object.freeze(entry);

export type ErrorCode = keyof typeof ERROR_CATALOG;
export type SafeError = Readonly<{
  code: ErrorCode;
  module: string;
  stage: string;
  retryable: boolean;
  message: string;
  action: string;
}>;
export type Result<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: SafeError }>;

export function success<T>(value: T): Result<T> {
  return Object.freeze({ ok: true, value });
}

// No raw exception, URL, token or untrusted context is accepted by this constructor.
export function failure(code: ErrorCode): Readonly<{ ok: false; error: SafeError }> {
  const safeCode = typeof code === 'string' && Object.hasOwn(ERROR_CATALOG, code) ? code : 'RV-CORE-005';
  return Object.freeze({ ok: false, error: Object.freeze({ code: safeCode, ...ERROR_CATALOG[safeCode] }) });
}

export function diagnosticError(error: unknown): SafeError {
  // Rebuild from the allowlist, discarding even unexpected properties on an input.
  try {
    if (typeof error === 'object' && error !== null && 'code' in error &&
      typeof error.code === 'string' && Object.hasOwn(ERROR_CATALOG, error.code)) {
      return failure(error.code as ErrorCode).error;
    }
  } catch { /* Hostile accessors are not diagnostic input. */ }
  return failure('RV-CORE-005').error;
}

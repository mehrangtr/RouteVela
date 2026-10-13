import { failure, success } from '../contracts/index.js';
import type { ByteDuplex, ErrorCode, Result, RelayLimits, Timers } from '../contracts/index.js';

export const DEFAULT_RELAY_LIMITS: RelayLimits = Object.freeze({ maxChunkBytes: 65_536,
  maxSessionBytes: 16_777_216, idleTimeoutMs: 30_000, cleanupTimeoutMs: 1000, maxEmptyReads: 8, maxSessionMs: 300_000 });

export function validLimits(limits: RelayLimits): boolean {
  if (typeof limits !== 'object' || limits === null || Array.isArray(limits)) return false;
  return [limits.maxChunkBytes, limits.maxSessionBytes, limits.idleTimeoutMs, limits.cleanupTimeoutMs,
    limits.maxEmptyReads, limits.maxSessionMs].every(value => Number.isSafeInteger(value) && value > 0) &&
    limits.maxChunkBytes <= 1_048_576 && limits.maxSessionBytes <= 1_073_741_824 && limits.idleTimeoutMs <= 3_600_000 &&
    limits.cleanupTimeoutMs <= 10_000 && limits.maxEmptyReads <= 128 && limits.maxSessionMs <= 86_400_000;
}

export class SessionFault extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) { super(code); this.code = code; }
}
export function sessionFailure(error: unknown): ReturnType<typeof failure> {
  return failure(error instanceof SessionFault ? error.code : 'RV-TRANS-005');
}

export function sessionOperation<T>(action: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const remove = () => signal.removeEventListener('abort', abort);
    const abort = () => { remove(); reject(new SessionFault(signal.reason === 'timeout' ? 'RV-TRANS-001' : 'RV-TRANS-004')); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    const rejected = (error: unknown) => {
      remove(); reject(error instanceof SessionFault ? error : new SessionFault('RV-TRANS-005'));
    };
    try {
      void action().then(value => { remove(); resolve(value); }, rejected);
    } catch (error) { rejected(error); }
  });
}

export function createDeadline(timers: Timers, idleMs: number, external?: AbortSignal, lifetimeMs?: number) {
  const controller = new AbortController();
  let cancelIdle = () => {};
  const stop = () => controller.abort('cancelled');
  const reset = () => {
    cancelIdle();
    if (!controller.signal.aborted) cancelIdle = timers.after(idleMs, () => controller.abort('timeout'));
  };
  if (external?.aborted) stop();
  else external?.addEventListener('abort', stop, { once: true });
  reset();
  const cancelLifetime = lifetimeMs === undefined || controller.signal.aborted ? () => {} :
    timers.after(lifetimeMs, () => controller.abort('timeout'));
  return { signal: controller.signal, reset, stop, dispose() {
    cancelIdle(); cancelLifetime(); external?.removeEventListener('abort', stop);
  } };
}

export async function closeDuplexes(ports: readonly ByteDuplex[], timers: Timers, timeoutMs: number): Promise<Result<void>> {
  let cancel = () => {};
  const expired = new Promise<null>(resolve => { cancel = timers.after(timeoutMs, () => resolve(null)); });
  try {
    const closed = Promise.allSettled([...new Set(ports)].map(port => Promise.resolve().then(() => port.close())));
    const outcome = await Promise.race([closed, expired]);
    return outcome === null || outcome.some(result => result.status === 'rejected') ?
      failure('RV-TRANS-007') : success(undefined);
  } finally { cancel(); }
}

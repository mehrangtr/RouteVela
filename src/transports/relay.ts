import { failure, success } from '../contracts/index.js';
import type { ByteDuplex, RelayStats, RelayLimits, Result, Timers } from '../contracts/index.js';
import { closeDuplexes, createDeadline, DEFAULT_RELAY_LIMITS, sessionOperation, sessionFailure, SessionFault, validLimits } from './session.js';

// One read/write at a time per direction; no queue/replay or automatic reconnect.
// A graceful EOF half-closes the opposite writer while the reverse direction drains.
export async function relayBytes(client: ByteDuplex, upstream: ByteDuplex, timers: Timers,
  limits: RelayLimits = DEFAULT_RELAY_LIMITS, signal?: AbortSignal, initialClientBytes = 0): Promise<Result<RelayStats>> {
  if (!validLimits(limits) || client === upstream || !Number.isSafeInteger(initialClientBytes) ||
    initialClientBytes < 0 || initialClientBytes > limits.maxSessionBytes) {
    await closeDuplexes([client, upstream], timers, DEFAULT_RELAY_LIMITS.cleanupTimeoutMs);
    return failure('RV-TRANS-006');
  }
  const control = createDeadline(timers, limits.idleTimeoutMs, signal, limits.maxSessionMs);
  const counts = { clientToUpstreamBytes: initialClientBytes, upstreamToClientBytes: 0 };
  let remainingBytes = limits.maxSessionBytes - initialClientBytes;
  const pump = async (from: ByteDuplex, to: ByteDuplex, direction: keyof RelayStats) => {
    let empty = 0;
    for (;;) {
      const chunk = await sessionOperation(() => from.read(control.signal), control.signal);
      if (chunk === null) { await sessionOperation(() => to.end(control.signal), control.signal); return; }
      if (!(chunk instanceof Uint8Array)) throw new SessionFault('RV-TRANS-005');
      if (chunk.byteLength > limits.maxChunkBytes) throw new SessionFault('RV-TRANS-002');
      if (chunk.byteLength === 0) {
        if (++empty > limits.maxEmptyReads) throw new SessionFault('RV-TRANS-003');
        continue;
      }
      empty = 0;
      if (chunk.byteLength > remainingBytes) throw new SessionFault('RV-TRANS-008');
      // Reserve before awaiting write so simultaneous opposite-direction writes
      // cannot spend the same remaining bytes. A failed write terminates the session.
      remainingBytes -= chunk.byteLength;
      if (!Number.isSafeInteger(counts[direction] + chunk.byteLength)) throw new SessionFault('RV-TRANS-006');
      await sessionOperation(() => to.write(new Uint8Array(chunk), control.signal), control.signal);
      counts[direction] += chunk.byteLength;
      control.reset();
    }
  };
  const pumps = [pump(client, upstream, 'clientToUpstreamBytes'), pump(upstream, client, 'upstreamToClientBytes')];
  let result: Result<RelayStats>;
  try {
    await Promise.all(pumps); result = success(Object.freeze({ ...counts }));
  } catch (error) {
    control.stop(); await Promise.allSettled(pumps); result = sessionFailure(error);
  } finally { control.dispose(); }
  const cleanup = await closeDuplexes([client, upstream], timers, limits.cleanupTimeoutMs);
  return result.ok && !cleanup.ok ? cleanup : result;
}

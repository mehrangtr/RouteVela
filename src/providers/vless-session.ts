import { failure, success, diagnosticError } from '../contracts/index.js';
import type { ByteDuplex, ConnectionAccess, Result, RelayStats, RelayLimits, Timers, HeaderProgress } from '../contracts/index.js';
import { VlessHeaderParser, vlessResponseHeader } from '../protocols/index.js';
import { relayBytes, closeDuplexes, createDeadline, DEFAULT_RELAY_LIMITS, SessionFault,
  sessionOperation, sessionFailure, validLimits } from '../transports/index.js';

// Runtime-neutral orchestration. Provider authentication and destination policy
// are mandatory injected ports; there is no default permissive public dialer.
export async function handleVlessSession(client: ByteDuplex, access: ConnectionAccess, timers: Timers,
  limits: RelayLimits = DEFAULT_RELAY_LIMITS, signal?: AbortSignal, handshakeTimeoutMs = 10_000): Promise<Result<RelayStats>> {
  if (!validLimits(limits) || !Number.isSafeInteger(handshakeTimeoutMs) || handshakeTimeoutMs < 1 || handshakeTimeoutMs > 60_000) {
    await closeDuplexes([client], timers, DEFAULT_RELAY_LIMITS.cleanupTimeoutMs);
    return failure('RV-TRANS-006');
  }
  const parser = new VlessHeaderParser();
  const control = createDeadline(timers, handshakeTimeoutMs, signal);
  let upstream: ByteDuplex | null = null;
  let relayOwnsCleanup = false;
  let outcome: Result<RelayStats>;
  try {
    let ready: Extract<HeaderProgress, { status: 'ready' }>;
    let empty = 0;
    for (;;) {
      const chunk = await sessionOperation(() => client.read(control.signal), control.signal);
      if (chunk === null) throw new SessionFault('RV-PROTO-002');
      if (chunk.byteLength > limits.maxChunkBytes) throw new SessionFault('RV-TRANS-002');
      if (chunk.byteLength === 0) {
        if (++empty > limits.maxEmptyReads) throw new SessionFault('RV-TRANS-003');
      } else empty = 0;
      const parsed = parser.push(chunk);
      if (!parsed.ok) throw new SessionFault(parsed.error.code);
      if (parsed.value.status === 'ready') { ready = parsed.value; break; }
    }
    const authorization = await sessionOperation(() => access.authorize(ready.request, control.signal), control.signal);
    if (!authorization.ok) throw new SessionFault(diagnosticError(authorization.error).code);
    const connected = await sessionOperation(() => access.dial(ready.request.destination, control.signal).then(result => {
      if (control.signal.aborted && result.ok) {
        // An adapter that ignored connect cancellation still must not leak a late socket.
        void closeDuplexes([result.value], timers, limits.cleanupTimeoutMs).catch(() => {});
      }
      return result;
    }), control.signal);
    if (!connected.ok) throw new SessionFault(diagnosticError(connected.error).code);
    upstream = connected.value;
    await sessionOperation(() => client.write(vlessResponseHeader(), control.signal), control.signal);
    if (ready.payload.byteLength) {
      const peer = upstream;
      await sessionOperation(() => peer.write(ready.payload, control.signal), control.signal);
    }
    control.dispose(); relayOwnsCleanup = true;
    const relayed = await relayBytes(client, upstream, timers, limits, signal);
    outcome = relayed.ok ? success(Object.freeze({ ...relayed.value,
      clientToUpstreamBytes: relayed.value.clientToUpstreamBytes + ready.payload.byteLength })) : relayed;
  } catch (error) { control.stop(); outcome = sessionFailure(error); }
  finally { parser.finish(); control.dispose(); }
  if (!relayOwnsCleanup) {
    const cleanup = await closeDuplexes(upstream ? [client, upstream] : [client], timers, limits.cleanupTimeoutMs);
    if (outcome.ok && !cleanup.ok) return cleanup;
  }
  return outcome;
}

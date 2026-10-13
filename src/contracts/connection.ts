import type { Result } from './errors.js';

export interface TcpDestination {
  readonly kind: 'ipv4' | 'ipv6' | 'domain';
  readonly host: string;
  readonly port: number;
}
export interface VlessRequest {
  readonly version: 0;
  readonly command: 'tcp';
  // A connection bearer credential: never include it in diagnostics or logs.
  readonly uuid: string;
  readonly destination: TcpDestination;
}
export type HeaderProgress = Readonly<{ status: 'need_more' }> | Readonly<{
  status: 'ready'; request: VlessRequest; payload: Uint8Array;
}>;

export interface ByteDuplex {
  // Implementations must bound their own queues and honor cancellation. Each
  // returned chunk is stable until the next read; null is a graceful half-close.
  read(signal: AbortSignal): Promise<Uint8Array | null>;
  write(chunk: Uint8Array, signal: AbortSignal): Promise<void>;
  end(signal: AbortSignal): Promise<void>;
  close(): Promise<void> | void;
}
export interface Timers {
  after(milliseconds: number, callback: () => void): () => void;
}
export interface RelayLimits {
  readonly maxChunkBytes: number;
  // Combined forwarded application bytes, including any initial VLESS payload.
  // Protocol/TLS framing overhead is not a provider billing quota.
  readonly maxSessionBytes: number;
  readonly idleTimeoutMs: number;
  readonly cleanupTimeoutMs: number;
  readonly maxEmptyReads: number;
  readonly maxSessionMs: number;
}
export interface RelayStats {
  readonly clientToUpstreamBytes: number;
  readonly upstreamToClientBytes: number;
}
export interface ConnectionAccess {
  authorize(request: VlessRequest, signal: AbortSignal): Promise<Result<void>>;
  // Production adapters must enforce destination/resolution/loop restrictions
  // here. A parsed host is not permission to connect to it.
  dial(destination: TcpDestination, signal: AbortSignal): Promise<Result<ByteDuplex>>;
}

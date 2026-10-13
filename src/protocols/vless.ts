import { failure, success } from '../contracts/index.js';
import type { Result, HeaderProgress, VlessRequest, TcpDestination, SafeError } from '../contracts/index.js';

export const MAX_VLESS_HEADER_BYTES = 276;
export const MAX_VLESS_FRAME_BYTES = 65_536;

// Only the header is retained. Addons/UDP/Mux/reverse commands are deliberately
// unsupported; payload is copied only once into a bounded returned frame.
export class VlessHeaderParser {
  #header = new Uint8Array(MAX_VLESS_HEADER_BYTES);
  #view = new DataView(this.#header.buffer);
  #length = 0;
  #complete = false;
  #error: SafeError | null = null;

  get bufferedBytes(): number { return this.#length; }

  #required(): Result<number> {
    if (this.#length < 1) return success(1);
    if (this.#view.getUint8(0) !== 0) return failure('RV-PROTO-003');
    if (this.#length < 18) return success(18);
    if (this.#view.getUint8(17) !== 0) return failure('RV-PROTO-003');
    if (this.#length < 19) return success(19);
    if (this.#view.getUint8(18) !== 1) return failure('RV-PROTO-003');
    if (this.#length < 22) return success(22);
    if (this.#view.getUint16(19) === 0) return failure('RV-PROTO-001');
    const type = this.#view.getUint8(21);
    if (type === 1) return success(26);
    if (type === 3) return success(38);
    if (type !== 2) return failure('RV-PROTO-001');
    if (this.#length < 23) return success(23);
    const length = this.#view.getUint8(22);
    return length > 0 && length <= 253 ? success(23 + length) : failure('RV-PROTO-001');
  }

  #request(): Result<VlessRequest> {
    const type = this.#view.getUint8(21);
    let host: string;
    let kind: TcpDestination['kind'];
    if (type === 1) {
      kind = 'ipv4'; host = Array.from(this.#header.subarray(22, 26)).join('.');
    } else if (type === 3) {
      kind = 'ipv6'; host = Array.from({ length: 8 }, (_, i) => this.#view.getUint16(22 + i * 2).toString(16)).join(':');
    } else {
      kind = 'domain';
      host = Array.from(this.#header.subarray(23, this.#length), byte => String.fromCharCode(byte)).join('').toLowerCase();
      if (host.endsWith('.')) host = host.slice(0, -1);
      if (!host || !host.split('.').every(label => label.length > 0 && label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return failure('RV-PROTO-001');
    }
    const hex = Array.from(this.#header.subarray(1, 17), byte => byte.toString(16).padStart(2, '0')).join('');
    const uuid = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
    return success(Object.freeze({ version: 0, command: 'tcp', uuid,
      destination: Object.freeze({ kind, host, port: this.#view.getUint16(19) }) }));
  }

  #fail(error: SafeError): Result<HeaderProgress> {
    this.#error = error;
    this.#header.fill(0); this.#length = 0;
    return failure(error.code);
  }

  push(chunk: Uint8Array): Result<HeaderProgress> {
    if (this.#error) return failure(this.#error.code);
    if (this.#complete) return failure('RV-PROTO-005');
    if (!(chunk instanceof Uint8Array)) return this.#fail(failure('RV-PROTO-001').error);
    if (chunk.byteLength > MAX_VLESS_FRAME_BYTES) return this.#fail(failure('RV-PROTO-004').error);
    let offset = 0;
    for (;;) {
      const required = this.#required();
      if (!required.ok) return this.#fail(required.error);
      if (this.#length === required.value) {
        const request = this.#request();
        if (!request.ok) return this.#fail(request.error);
        this.#complete = true;
        this.#header.fill(0); this.#length = 0;
        return success(Object.freeze({ status: 'ready', request: request.value, payload: new Uint8Array(chunk.subarray(offset)) }));
      }
      if (offset === chunk.byteLength) return success(Object.freeze({ status: 'need_more' }));
      const take = Math.min(required.value - this.#length, chunk.byteLength - offset);
      this.#header.set(chunk.subarray(offset, offset + take), this.#length);
      this.#length += take; offset += take;
    }
  }

  finish(): Result<void> {
    if (this.#error) return failure(this.#error.code);
    if (this.#complete) return success(undefined);
    this.#fail(failure('RV-PROTO-002').error);
    return failure('RV-PROTO-002');
  }
}

export function vlessResponseHeader(): Uint8Array { return new Uint8Array([0, 0]); }

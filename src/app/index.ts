import { parseProfile } from '../config/index.js';
import { compileProfile } from '../compiler/index.js';
import type { ClientTarget } from '../compiler/index.js';
import type { Result, RuntimeCapabilities } from '../contracts/index.js';

// Pure composition only; neither importing nor previewing a profile opens a socket.
export function renderProfile(source: string, capabilities: RuntimeCapabilities, target: ClientTarget): Result<string> {
  const parsed = parseProfile(source, capabilities);
  return parsed.ok ? compileProfile(parsed.value, target) : parsed;
}

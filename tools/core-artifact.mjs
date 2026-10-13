import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './project.mjs';

export const CORE_VERSION = '1.12.0';
// Authenticated upstream GitHub release-asset digests, reviewed 2026-10-13.
// https://github.com/SagerNet/sing-box/releases/expanded_assets/v1.12.0
const digests = Object.freeze({
  'linux-x64': 'f59b1253ae0143997cb46915af30d14a33431dcbd7e39edacfcde8d73050faaf',
  'linux-arm64': '90e8b40320971db689b789ab95f54e9762bc24250f29ba59012049ab7867f456',
  'win32-x64': '49a5b90b390974a87b4660308446dfd9630f60ac655f76383abbd5f0994b09b3',
  'win32-arm64': 'b41c7322e2f3fb0e2ad2ff60db577fcf28dd05a58f7f33456ec1be4ae0540693',
});

export function coreArtifact(platform, arch) {
  const digest = digests[`${platform}-${arch}`];
  if (!digest) throw new Error('CORE_PLATFORM_UNSUPPORTED');
  const directory = `sing-box-${CORE_VERSION}-${platform === 'win32' ? 'windows' : 'linux'}-${arch === 'x64' ? 'amd64' : 'arm64'}`;
  const filename = `${directory}.${platform === 'win32' ? 'zip' : 'tar.gz'}`;
  return Object.freeze({ digest, filename, member: `${directory}/sing-box${platform === 'win32' ? '.exe' : ''}`,
    url: `https://github.com/SagerNet/sing-box/releases/download/v${CORE_VERSION}/${filename}` });
}

export function verifyCoreArchive(bytes, artifact) {
  if (bytes.byteLength > 40 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== artifact.digest) {
    throw new Error('CORE_ARCHIVE_INTEGRITY');
  }
}

function command(name, args) {
  const run = spawnSync(name, args, { shell: false, encoding: 'utf8', timeout: 90_000, maxBuffer: 1024 * 1024 });
  if (run.status !== 0) throw new Error(`CORE_TOOL_FAILED:${name}:${run.status ?? run.error?.code}`);
}

// Test tool only. curl/tar are provided by current Windows 10+/Linux runners.
// Verify even cached archives; extract only the known member into a fresh directory.
export function provisionCore() {
  const artifact = coreArtifact(process.platform, process.arch);
  const cache = resolve(ROOT, '.tmp/cores'); mkdirSync(cache, { recursive: true });
  const archive = join(cache, artifact.filename);
  if (!existsSync(archive)) {
    const partial = `${archive}.part`;
    try {
      command('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https',
        '--proto-redir', '=https', '--max-time', '60', '--max-filesize', String(40 * 1024 * 1024),
        artifact.url, '--output', partial]);
      verifyCoreArchive(readFileSync(partial), artifact);
      // Do not trust a previous executable or a hash computed without an upstream pin.
      renameSync(partial, archive);
    } finally { rmSync(partial, { force: true }); }
  }
  const metadata = lstatSync(archive);
  if (!metadata.isFile() || metadata.size > 40 * 1024 * 1024) throw new Error('CORE_ARCHIVE_TYPE_OR_SIZE');
  verifyCoreArchive(readFileSync(archive), artifact);
  const extracted = mkdtempSync(join(cache, 'verified-'));
  try {
    command('tar', ['-xf', archive, '-C', extracted, artifact.member]);
    const binary = join(extracted, artifact.member);
    if (!lstatSync(binary).isFile()) throw new Error('CORE_BINARY_TYPE');
    return { binary, artifact, dispose: () => rmSync(extracted, { recursive: true, force: true }) };
  } catch (error) { rmSync(extracted, { recursive: true, force: true }); throw error; }
}

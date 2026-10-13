import test from 'node:test';
import assert from 'node:assert/strict';
import { coreArtifact, verifyCoreArchive } from '../tools/core-artifact.mjs';

test('core provisioning rejects tampered archive bytes before extraction or execution', () => {
  assert.throws(() => verifyCoreArchive(Buffer.from('corrupted cache'), coreArtifact('linux', 'x64')), /CORE_ARCHIVE_INTEGRITY/);
});

test('core provisioning supports explicit Windows/Linux targets and fails closed elsewhere', () => {
  for (const platform of ['linux', 'win32']) for (const arch of ['x64', 'arm64']) {
    const artifact = coreArtifact(platform, arch);
    assert.match(artifact.url, /^https:\/\/github.com\/SagerNet\/sing-box\/releases\/download\/v1\.12\.0\//);
    assert.match(artifact.digest, /^[a-f0-9]{64}$/);
    assert.equal(artifact.member.endsWith('.exe'), platform === 'win32');
  }
  assert.throws(() => coreArtifact('darwin', 'x64'), /CORE_PLATFORM_UNSUPPORTED/);
  assert.throws(() => coreArtifact('linux', 'ia32'), /CORE_PLATFORM_UNSUPPORTED/);
});

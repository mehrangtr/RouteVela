import test from 'node:test';
import assert from 'node:assert/strict';
import { labOptions } from '../tools/local-lab.mjs';

test('local lab rejects external bind/destination overrides and unbounded lifetime', () => {
  for (const args of [['--host', '0.0.0.0'], ['--target', 'example.com'], ['--duration-ms', '0'],
    ['--duration-ms', '120001'], ['--duration-ms', 'Infinity'], ['--duration-ms'], ['--smoke', '--smoke']]) {
    assert.throws(() => labOptions(args), /LAB_ARGUMENTS/);
  }
  assert.deepEqual(labOptions([]), { smoke: false, durationMs: 60_000 });
  assert.deepEqual(labOptions(['--smoke', '--duration-ms', '1000']), { smoke: true, durationMs: 1000 });
});

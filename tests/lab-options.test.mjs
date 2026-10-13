import test from 'node:test';
import assert from 'node:assert/strict';
import { labOptions, runLab } from '../tools/local-lab.mjs';

test('local lab rejects external bind/destination overrides and unbounded lifetime', () => {
  for (const args of [['--host', '0.0.0.0'], ['--target', 'example.com'], ['--duration-ms', '0'],
    ['--duration-ms', '120001'], ['--duration-ms', 'Infinity'], ['--duration-ms'], ['--smoke', '--smoke']]) {
    assert.throws(() => labOptions(args), /LAB_ARGUMENTS/);
  }
  assert.deepEqual(labOptions([]), { smoke: false, durationMs: 60_000 });
  assert.deepEqual(labOptions(['--smoke', '--duration-ms', '1000']), { smoke: true, durationMs: 1000 });
});

test('direct local-lab calls reject malformed options before allocating resources or listeners', async () => {
  const interrupt = process.listenerCount('SIGINT'); const terminate = process.listenerCount('SIGTERM');
  let events = 0;
  for (const options of [null, {}, [], { smoke: 'true', durationMs: 1000 },
    { smoke: false, durationMs: Infinity }, { smoke: true, durationMs: 1000, host: '0.0.0.0' }]) {
    await assert.rejects(runLab(options, () => { events++; }), /LAB_ARGUMENTS/);
  }
  assert.equal(events, 0); assert.equal(process.listenerCount('SIGINT'), interrupt);
  assert.equal(process.listenerCount('SIGTERM'), terminate);
});

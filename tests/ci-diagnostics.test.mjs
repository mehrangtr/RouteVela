import test from 'node:test';
import assert from 'node:assert/strict';
import { failureAnnotation } from '../tools/ci-diagnostics.mjs';

test('public CI failure annotations expose stable stages while stripping raw credential/payload strings', () => {
  const output = failureAnnotation({ file: '/private/user/tests/core-interop.mjs', line: 100,
    name: 'real core VLESS/WSS connection: permitted', details: { error: { code: 'ERR_TEST_FAILURE',
      message: 'SECRET_EXCEPTION', cause: { code: 'ERR_ASSERTION', expected: true, actual: false,
        message: 'SECRET_TOKEN_AND_TARGET', cause: { message: 'CORE_TOOL_FAILED:curl:28' } } } } });
  assert.match(output, /file=core-interop.mjs; line=100/);
  assert.match(output, /code=ERR_ASSERTION; expected=true; actual=false/);
  assert.match(output, /stage=CORE_TOOL_FAILED:curl:28/);
  assert.ok(!output.includes('SECRET')); assert.ok(!output.includes('/private/'));
});

test('public CI annotations omit arbitrary test names, string assertions and unknown error messages', () => {
  const output = failureAnnotation({ name: 'SECRET_TEST_INPUT', details: {
    error: { message: 'SECRET_RAW_EXCEPTION', actual: 'SECRET_PAYLOAD', expected: 'SECRET_CONFIG' } } });
  assert.equal(output, '::error title=RouteVela test failure::file=test\n');
});

test('real assertion error formatting retains only its leading safe session code', () => {
  let error;
  try { assert.equal(false, true, 'RV-TRANS-007'); } catch (caught) { error = caught; }
  const output = failureAnnotation({ details: { error: { code: 'ERR_TEST_FAILURE', cause: error } } });
  assert.match(output, /session=RV-TRANS-007/); assert.ok(!output.includes('false !== true'));
  const hostile = failureAnnotation({ details: { error: { message: 'RV-TRANS-005\nSECRET_CONTEXT' } } });
  assert.match(hostile, /session=RV-TRANS-005/); assert.ok(!hostile.includes('SECRET'));
});

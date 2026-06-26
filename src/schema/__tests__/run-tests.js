/**
 * Schema module test runner — compiled JS, no Jest dependency.
 *
 * Usage: node src/schema/__tests__/run-tests.js
 *
 * Tests all four INVARIANT patches:
 *   SCHEMA-001: Element-level validation before cast
 *   SCHEMA-002: Referential integrity (dangling type references)
 *   SCHEMA-003: Typed error hierarchy
 *   SCHEMA-004: Duplicate name detection
 */

const { JSONSchemaParser } = require('./compiled/parser');
const { SchemaDefinitionValidator } = require('./compiled/validator');
const { SchemaParseError, SchemaValidationError, SchemaError } = require('./compiled/errors');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertThrows(fn, ErrorClass, messageContains) {
  try {
    fn();
    throw new Error(`Expected ${ErrorClass.name} but no error was thrown`);
  } catch (e) {
    if (e instanceof ErrorClass) {
      if (messageContains && !e.message.includes(messageContains)) {
        throw new Error(
          `Error message did not contain "${messageContains}": ${e.message}`
        );
      }
      return; // success
    }
    throw e; // wrong error type — re-throw
  }
}

function buildValidSchema(opts = {}) {
  return {
    version: opts.version || '1.0.0',
    rpcCalls: opts.rpcCalls || [
      { name: 'getUser', inputType: 'UserInput', outputType: 'UserOutput', errorCodes: ['NOT_FOUND'] },
    ],
    types: opts.types || [
      { name: 'UserInput', fields: [{ name: 'id', type: 'string', required: true }] },
      { name: 'UserOutput', fields: [{ name: 'name', type: 'string', required: true }] },
    ],
    errorCodes: opts.errorCodes || [
      { code: 'NOT_FOUND', message: 'Resource not found', httpStatus: 404 },
    ],
  };
}

const parser = new JSONSchemaParser();
const validator = new SchemaDefinitionValidator();

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA-001: Element-level validation
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\nSCHEMA-001 — Element-level validation');

test('rejects string input', () => {
  assertThrows(() => parser.parse('"just a string"'), SchemaParseError);
});

test('rejects array input', () => {
  assertThrows(() => parser.parse('["not", "an", "object"]'), SchemaParseError);
});

test('rejects number input', () => {
  assertThrows(() => parser.parse('42'), SchemaParseError);
});

test('rejects null input', () => {
  assertThrows(() => parser.parse('null'), SchemaParseError);
});

test('rejects empty string', () => {
  assertThrows(() => parser.parse(''), SchemaParseError);
});

test('rejects rpcCall with empty name', () => {
  const schema = buildValidSchema({
    rpcCalls: [{ name: '', inputType: 'UserInput', outputType: 'UserOutput', errorCodes: [] }],
  });
  assertThrows(() => parser.parse(JSON.stringify(schema)), SchemaParseError, 'non-empty string');
});

test('accepts valid schema', () => {
  const schema = buildValidSchema();
  const result = parser.parse(JSON.stringify(schema));
  assert(result.version === '1.0.0', 'Version should be preserved');
  assert(result.rpcCalls.length === 1, 'Should have one RPC call');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA-002: Referential integrity
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\nSCHEMA-002 — Referential integrity');

test('validator rejects inputType not in types', () => {
  const schema = buildValidSchema({
    rpcCalls: [
      { name: 'getUser', inputType: 'NonExistentType', outputType: 'UserOutput', errorCodes: [] },
    ],
  });
  const result = validator.validate(schema);
  assert(!result.valid, 'Should be invalid');
  assert(
    result.errors.some((e) => e.includes('"NonExistentType" does not reference any defined type')),
    'Should mention NonExistentType',
  );
});

test('validator rejects outputType not in types', () => {
  const schema = buildValidSchema({
    rpcCalls: [
      { name: 'getUser', inputType: 'UserInput', outputType: 'MissingOutput', errorCodes: [] },
    ],
  });
  const result = validator.validate(schema);
  assert(!result.valid, 'Should be invalid');
  assert(
    result.errors.some((e) => e.includes('"MissingOutput" does not reference any defined type')),
    'Should mention MissingOutput',
  );
});

test('validator rejects errorCode not in errorCodes', () => {
  const schema = buildValidSchema({
    rpcCalls: [
      { name: 'getUser', inputType: 'UserInput', outputType: 'UserOutput', errorCodes: ['UNKNOWN_CODE'] },
    ],
  });
  const result = validator.validate(schema);
  assert(!result.valid, 'Should be invalid');
  assert(
    result.errors.some((e) => e.includes('"UNKNOWN_CODE" does not reference any defined error code')),
    'Should mention UNKNOWN_CODE',
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA-003: Typed error hierarchy
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\nSCHEMA-003 — Typed error hierarchy');

test('SchemaParseError extends SchemaError', () => {
  const e = new SchemaParseError('test');
  assert(e instanceof SchemaParseError, 'Should be SchemaParseError');
  assert(e instanceof SchemaError, 'Should be SchemaError');
  assert(e instanceof Error, 'Should be Error');
});

test('SchemaValidationError extends SchemaError', () => {
  const e = new SchemaValidationError('test', ['err1', 'err2']);
  assert(e instanceof SchemaValidationError, 'Should be SchemaValidationError');
  assert(e instanceof SchemaError, 'Should be SchemaError');
  assert(e.validationErrors.length === 2, 'Should have validation errors');
});

test('catch block can distinguish parse from validation', () => {
  // Parse error
  try {
    parser.parse('"string"');
  } catch (e) {
    assert(e instanceof SchemaParseError, 'String input should throw SchemaParseError');
  }
  // Validation error is separate — tested via validator.validate()
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA-004: Duplicate name detection
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\nSCHEMA-004 — Duplicate detection');

test('validator rejects duplicate rpcCall names', () => {
  const schema = buildValidSchema({
    rpcCalls: [
      { name: 'getUser', inputType: 'UserInput', outputType: 'UserOutput', errorCodes: [] },
      { name: 'getUser', inputType: 'UserInput', outputType: 'UserOutput', errorCodes: [] },
    ],
  });
  const result = validator.validate(schema);
  assert(!result.valid, 'Should be invalid');
  assert(
    result.errors.some((e) => e.includes('duplicate name "getUser"')),
    'Should detect duplicate getUser',
  );
});

test('validator rejects duplicate type names', () => {
  const schema = buildValidSchema({
    types: [
      { name: 'UserInput', fields: [] },
      { name: 'UserInput', fields: [] },
    ],
  });
  const result = validator.validate(schema);
  assert(!result.valid, 'Should be invalid');
  assert(
    result.errors.some((e) => e.includes('types: duplicate name "UserInput"')),
    'Should detect duplicate UserInput type',
  );
});

test('valid schema passes all checks', () => {
  const schema = buildValidSchema();
  const result = validator.validate(schema);
  assert(result.valid, `Should be valid, got: ${result.errors.join('; ')}`);
  assert(result.errors.length === 0, 'Should have no errors');
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

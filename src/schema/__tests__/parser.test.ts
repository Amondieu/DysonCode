/**
 * Schema parser + validator tests — all coverage gaps closed.
 *
 * COVERAGE [schema.ts:42-48]  — non-object JSON
 * COVERAGE [schema.ts:55-62]  — null/undefined
 * FUZZ boundary                — empty name fields
 * schema-002                   — dangling type reference
 * schema-004                   — duplicate names
 */

import { JSONSchemaParser, SchemaDefinition } from '../parser';
import { SchemaDefinitionValidator } from '../validator';
import { SchemaParseError } from '../errors';

// ── Helpers ──────────────────────────────────────────────────────────────────

interface BuildOptions {
  version?: string;
  rpcCalls?: Array<Partial<SchemaDefinition['rpcCalls'][number]>>;
  types?: Array<Partial<SchemaDefinition['types'][number]>>;
  errorCodes?: Array<Partial<SchemaDefinition['errorCodes'][number]>>;
}

function buildValidSchema(opts: BuildOptions = {}): SchemaDefinition {
  return {
    version: opts.version ?? '1.0.0',
    rpcCalls: (opts.rpcCalls ?? [
      { name: 'getUser', inputType: 'UserInput', outputType: 'UserOutput', errorCodes: ['NOT_FOUND'] },
    ]) as SchemaDefinition['rpcCalls'],
    types: (opts.types ?? [
      { name: 'UserInput', fields: [{ name: 'id', type: 'string', required: true }] },
      { name: 'UserOutput', fields: [{ name: 'name', type: 'string', required: true }] },
    ]) as SchemaDefinition['types'],
    errorCodes: (opts.errorCodes ?? [
      { code: 'NOT_FOUND', message: 'Resource not found', httpStatus: 404 },
    ]) as SchemaDefinition['errorCodes'],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

const parser = new JSONSchemaParser();
const validator = new SchemaDefinitionValidator();

// ── COVERAGE [schema.ts:42-48] — non-object JSON ──

describe('validateStructure — non-object JSON', () => {
  it('rejects string input', () => {
    expect(() => parser.parse('"just a string"')).toThrow(SchemaParseError);
  });

  it('rejects array input', () => {
    expect(() => parser.parse('["not", "an", "object"]')).toThrow(SchemaParseError);
  });

  it('rejects number input', () => {
    expect(() => parser.parse('42')).toThrow(SchemaParseError);
  });
});

// ── COVERAGE [schema.ts:55-62] — null/undefined ──

describe('validateStructure — null/empty', () => {
  it('rejects null input', () => {
    expect(() => parser.parse('null')).toThrow(SchemaParseError);
  });

  it('rejects empty string input with SyntaxError from JSON.parse', () => {
    expect(() => parser.parse('')).toThrow(SchemaParseError);
  });
});

// ── FUZZ boundary — empty name fields ──

describe('FUZZ boundary — empty fields', () => {
  it('rejects rpcCall with empty name', () => {
    const schema = buildValidSchema({
      rpcCalls: [{ name: '', inputType: 'UserInput', outputType: 'UserOutput', errorCodes: [] }],
    });
    expect(() => parser.parse(JSON.stringify(schema))).toThrow(SchemaParseError);
  });
});

// ── schema-002 — dangling type reference ──

describe('schema-002 — referential integrity', () => {
  it('validator rejects inputType not in types', () => {
    const schema = buildValidSchema({
      rpcCalls: [
        { name: 'getUser', inputType: 'NonExistentType', outputType: 'UserOutput', errorCodes: [] },
      ],
    });
    const result = validator.validate(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"NonExistentType" does not reference any defined type'))).toBe(true);
  });

  it('validator rejects outputType not in types', () => {
    const schema = buildValidSchema({
      rpcCalls: [
        { name: 'getUser', inputType: 'UserInput', outputType: 'MissingOutput', errorCodes: [] },
      ],
    });
    const result = validator.validate(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"MissingOutput" does not reference any defined type'))).toBe(true);
  });

  it('validator rejects errorCode not in errorCodes', () => {
    const schema = buildValidSchema({
      rpcCalls: [
        { name: 'getUser', inputType: 'UserInput', outputType: 'UserOutput', errorCodes: ['UNKNOWN_CODE'] },
      ],
    });
    const result = validator.validate(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"UNKNOWN_CODE" does not reference any defined error code'))).toBe(true);
  });
});

// ── schema-004 — duplicate names ──

describe('schema-004 — duplicate detection', () => {
  it('validator rejects duplicate rpcCall names', () => {
    const schema = buildValidSchema({
      rpcCalls: [
        { name: 'getUser', inputType: 'UserInput', outputType: 'UserOutput', errorCodes: [] },
        { name: 'getUser', inputType: 'UserInput', outputType: 'UserOutput', errorCodes: [] },
      ],
    });
    const result = validator.validate(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate name "getUser"'))).toBe(true);
  });

  it('validator rejects duplicate type names', () => {
    const schema = buildValidSchema({
      types: [
        { name: 'UserInput', fields: [] },
        { name: 'UserInput', fields: [] },
      ],
    });
    const result = validator.validate(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('types: duplicate name "UserInput"'))).toBe(true);
  });
});

// ── Valid schema passes ──

describe('valid schema', () => {
  it('accepts a well-formed schema', () => {
    const schema = buildValidSchema();
    const result = validator.validate(schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

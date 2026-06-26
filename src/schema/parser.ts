/**
 * JSON Schema Parser with element-level structural validation.
 *
 * INVARIANT [SCHEMA-001]: JSON.parse output must never be cast directly
 * to a typed interface. Element-level structural validation must run
 * before any cast. Every array field must have its elements validated,
 * not just the array's existence.
 */

import { SchemaParseError } from './errors';

// ── Type Definitions ────────────────────────────────────────────────────────

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
}

export interface SchemaType {
  name: string;
  fields: SchemaField[];
}

export interface RPCCall {
  name: string;
  inputType: string;
  outputType: string;
  errorCodes: string[];
}

export interface ErrorCode {
  code: string;
  message: string;
  httpStatus: number;
}

export interface SchemaDefinition {
  version: string;
  rpcCalls: RPCCall[];
  types: SchemaType[];
  errorCodes: ErrorCode[];
}

// ── Parser Interface ────────────────────────────────────────────────────────

export interface SchemaParser {
  parse(schema: string): SchemaDefinition;
}

// ── Implementation ──────────────────────────────────────────────────────────

export class JSONSchemaParser implements SchemaParser {
  parse(schema: string): SchemaDefinition {
    let parsed: unknown;
    try {
      parsed = JSON.parse(schema);
    } catch (e) {
      throw new SchemaParseError(`Invalid JSON: ${(e as Error).message}`);
    }
    this.validateStructure(parsed);
    return parsed as SchemaDefinition; // safe — validateStructure guarantees shape
  }

  private validateStructure(obj: unknown): void {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new SchemaParseError('Schema must be a JSON object, not a primitive or array');
    }
    const s = obj as Record<string, unknown>;

    if (!s.version || typeof s.version !== 'string') {
      throw new SchemaParseError('Schema.version must be a non-empty string');
    }
    if (!Array.isArray(s.rpcCalls)) {
      throw new SchemaParseError('Schema.rpcCalls must be an array');
    }
    if (!Array.isArray(s.types)) {
      throw new SchemaParseError('Schema.types must be an array');
    }
    if (!Array.isArray(s.errorCodes)) {
      throw new SchemaParseError('Schema.errorCodes must be an array');
    }

    // PATCH schema-001: element-level validation — no more unsafe casts
    s.rpcCalls.forEach((call, i) => this.validateRPCCallShape(call, i));
    s.types.forEach((type, i) => this.validateTypeShape(type, i));
    s.errorCodes.forEach((code, i) => this.validateErrorCodeShape(code, i));
  }

  private validateRPCCallShape(call: unknown, index: number): void {
    if (typeof call !== 'object' || call === null) {
      throw new SchemaParseError(`rpcCalls[${index}] must be an object`);
    }
    const c = call as Record<string, unknown>;
    if (!c.name || typeof c.name !== 'string') {
      throw new SchemaParseError(`rpcCalls[${index}].name must be a non-empty string`);
    }
    if (!c.inputType || typeof c.inputType !== 'string') {
      throw new SchemaParseError(`rpcCalls[${index}].inputType must be a non-empty string`);
    }
    if (!c.outputType || typeof c.outputType !== 'string') {
      throw new SchemaParseError(`rpcCalls[${index}].outputType must be a non-empty string`);
    }
    if (!Array.isArray(c.errorCodes)) {
      throw new SchemaParseError(`rpcCalls[${index}].errorCodes must be an array`);
    }
    c.errorCodes.forEach((code, j) => {
      if (typeof code !== 'string') {
        throw new SchemaParseError(
          `rpcCalls[${index}].errorCodes[${j}] must be a string`,
        );
      }
    });
  }

  private validateTypeShape(type: unknown, index: number): void {
    if (typeof type !== 'object' || type === null) {
      throw new SchemaParseError(`types[${index}] must be an object`);
    }
    const t = type as Record<string, unknown>;
    if (!t.name || typeof t.name !== 'string') {
      throw new SchemaParseError(`types[${index}].name must be a non-empty string`);
    }
    if (!Array.isArray(t.fields)) {
      throw new SchemaParseError(`types[${index}].fields must be an array`);
    }
    t.fields.forEach((field, j) => this.validateFieldShape(field, t.name as string, j));
  }

  private validateFieldShape(field: unknown, typeName: string, index: number): void {
    if (typeof field !== 'object' || field === null) {
      throw new SchemaParseError(`types.${typeName}.fields[${index}] must be an object`);
    }
    const f = field as Record<string, unknown>;
    if (!f.name || typeof f.name !== 'string') {
      throw new SchemaParseError(
        `types.${typeName}.fields[${index}].name must be a non-empty string`,
      );
    }
    if (!f.type || typeof f.type !== 'string') {
      throw new SchemaParseError(
        `types.${typeName}.fields[${index}].type must be a non-empty string`,
      );
    }
    if (typeof f.required !== 'boolean') {
      throw new SchemaParseError(
        `types.${typeName}.fields[${index}].required must be a boolean`,
      );
    }
  }

  private validateErrorCodeShape(code: unknown, index: number): void {
    if (typeof code !== 'object' || code === null) {
      throw new SchemaParseError(`errorCodes[${index}] must be an object`);
    }
    const c = code as Record<string, unknown>;
    if (!c.code || typeof c.code !== 'string') {
      throw new SchemaParseError(`errorCodes[${index}].code must be a non-empty string`);
    }
    if (!c.message || typeof c.message !== 'string') {
      throw new SchemaParseError(`errorCodes[${index}].message must be a non-empty string`);
    }
    if (
      typeof c.httpStatus !== 'number' ||
      !Number.isInteger(c.httpStatus) ||
      c.httpStatus < 100 ||
      c.httpStatus > 599
    ) {
      throw new SchemaParseError(
        `errorCodes[${index}].httpStatus must be an integer between 100 and 599`,
      );
    }
  }
}

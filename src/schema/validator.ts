/**
 * Schema Definition Validator — referential integrity + duplicate detection.
 *
 * INVARIANT [SCHEMA-002]: Any schema that contains name references
 * (inputType, outputType, errorCode references) must validate referential
 * integrity — all referenced names must exist in their respective
 * definition arrays before the schema is marked valid.
 *
 * INVARIANT [SCHEMA-004]: All definition arrays (rpcCalls, types,
 * errorCodes) must be checked for duplicate name/code values before
 * the schema is marked valid. Duplicate detection runs in O(n) using
 * a Set — never O(n²) using nested loops.
 */

import { SchemaDefinition } from './parser';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SchemaValidator {
  validate(schema: SchemaDefinition): ValidationResult;
}

// ── Implementation ──────────────────────────────────────────────────────────

export class SchemaDefinitionValidator implements SchemaValidator {
  validate(schema: SchemaDefinition): ValidationResult {
    const errors: string[] = [];

    // ── Field-level checks ──
    if (!schema.version) {
      errors.push('Version must be a non-empty string');
    }
    if (schema.rpcCalls.length === 0) {
      errors.push('At least one RPC call definition is required');
    }
    if (schema.errorCodes.length === 0) {
      errors.push('At least one error code definition is required');
    }

    // ── PATCH schema-002: referential integrity ──
    const typeNames = new Set(schema.types.map((t) => t.name));
    const errorCodeNames = new Set(schema.errorCodes.map((e) => e.code));

    schema.rpcCalls.forEach((call, i) => {
      if (call.name === '') {
        errors.push(`rpcCalls[${i}].name must not be empty`);
      }
      // inputType must reference a known type
      if (!typeNames.has(call.inputType)) {
        errors.push(
          `rpcCalls[${i}] "${call.name}": inputType "${call.inputType}" ` +
            `does not reference any defined type`,
        );
      }
      // outputType must reference a known type
      if (!typeNames.has(call.outputType)) {
        errors.push(
          `rpcCalls[${i}] "${call.name}": outputType "${call.outputType}" ` +
            `does not reference any defined type`,
        );
      }
      // errorCodes in RPC call must reference known error codes
      call.errorCodes.forEach((code) => {
        if (!errorCodeNames.has(code)) {
          errors.push(
            `rpcCalls[${i}] "${call.name}": errorCode "${code}" ` +
              `does not reference any defined error code`,
          );
        }
      });
    });

    // ── PATCH schema-004: duplicate name detection ──
    this.checkDuplicates(
      schema.rpcCalls.map((c) => c.name),
      'rpcCalls',
      errors,
    );
    this.checkDuplicates(
      schema.types.map((t) => t.name),
      'types',
      errors,
    );
    this.checkDuplicates(
      schema.errorCodes.map((e) => e.code),
      'errorCodes',
      errors,
    );

    return { valid: errors.length === 0, errors };
  }

  private checkDuplicates(names: string[], context: string, errors: string[]): void {
    const seen = new Set<string>();
    names.forEach((name) => {
      if (seen.has(name)) {
        errors.push(`${context}: duplicate name "${name}" — names must be unique`);
      }
      seen.add(name);
    });
  }
}

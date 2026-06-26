"use strict";
/**
 * JSON Schema Parser with element-level structural validation.
 *
 * INVARIANT [SCHEMA-001]: JSON.parse output must never be cast directly
 * to a typed interface. Element-level structural validation must run
 * before any cast. Every array field must have its elements validated,
 * not just the array's existence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSONSchemaParser = void 0;
const errors_1 = require("./errors");
// ── Implementation ──────────────────────────────────────────────────────────
class JSONSchemaParser {
    parse(schema) {
        let parsed;
        try {
            parsed = JSON.parse(schema);
        }
        catch (e) {
            throw new errors_1.SchemaParseError(`Invalid JSON: ${e.message}`);
        }
        this.validateStructure(parsed);
        return parsed; // safe — validateStructure guarantees shape
    }
    validateStructure(obj) {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            throw new errors_1.SchemaParseError('Schema must be a JSON object, not a primitive or array');
        }
        const s = obj;
        if (!s.version || typeof s.version !== 'string') {
            throw new errors_1.SchemaParseError('Schema.version must be a non-empty string');
        }
        if (!Array.isArray(s.rpcCalls)) {
            throw new errors_1.SchemaParseError('Schema.rpcCalls must be an array');
        }
        if (!Array.isArray(s.types)) {
            throw new errors_1.SchemaParseError('Schema.types must be an array');
        }
        if (!Array.isArray(s.errorCodes)) {
            throw new errors_1.SchemaParseError('Schema.errorCodes must be an array');
        }
        // PATCH schema-001: element-level validation — no more unsafe casts
        s.rpcCalls.forEach((call, i) => this.validateRPCCallShape(call, i));
        s.types.forEach((type, i) => this.validateTypeShape(type, i));
        s.errorCodes.forEach((code, i) => this.validateErrorCodeShape(code, i));
    }
    validateRPCCallShape(call, index) {
        if (typeof call !== 'object' || call === null) {
            throw new errors_1.SchemaParseError(`rpcCalls[${index}] must be an object`);
        }
        const c = call;
        if (!c.name || typeof c.name !== 'string') {
            throw new errors_1.SchemaParseError(`rpcCalls[${index}].name must be a non-empty string`);
        }
        if (!c.inputType || typeof c.inputType !== 'string') {
            throw new errors_1.SchemaParseError(`rpcCalls[${index}].inputType must be a non-empty string`);
        }
        if (!c.outputType || typeof c.outputType !== 'string') {
            throw new errors_1.SchemaParseError(`rpcCalls[${index}].outputType must be a non-empty string`);
        }
        if (!Array.isArray(c.errorCodes)) {
            throw new errors_1.SchemaParseError(`rpcCalls[${index}].errorCodes must be an array`);
        }
        c.errorCodes.forEach((code, j) => {
            if (typeof code !== 'string') {
                throw new errors_1.SchemaParseError(`rpcCalls[${index}].errorCodes[${j}] must be a string`);
            }
        });
    }
    validateTypeShape(type, index) {
        if (typeof type !== 'object' || type === null) {
            throw new errors_1.SchemaParseError(`types[${index}] must be an object`);
        }
        const t = type;
        if (!t.name || typeof t.name !== 'string') {
            throw new errors_1.SchemaParseError(`types[${index}].name must be a non-empty string`);
        }
        if (!Array.isArray(t.fields)) {
            throw new errors_1.SchemaParseError(`types[${index}].fields must be an array`);
        }
        t.fields.forEach((field, j) => this.validateFieldShape(field, t.name, j));
    }
    validateFieldShape(field, typeName, index) {
        if (typeof field !== 'object' || field === null) {
            throw new errors_1.SchemaParseError(`types.${typeName}.fields[${index}] must be an object`);
        }
        const f = field;
        if (!f.name || typeof f.name !== 'string') {
            throw new errors_1.SchemaParseError(`types.${typeName}.fields[${index}].name must be a non-empty string`);
        }
        if (!f.type || typeof f.type !== 'string') {
            throw new errors_1.SchemaParseError(`types.${typeName}.fields[${index}].type must be a non-empty string`);
        }
        if (typeof f.required !== 'boolean') {
            throw new errors_1.SchemaParseError(`types.${typeName}.fields[${index}].required must be a boolean`);
        }
    }
    validateErrorCodeShape(code, index) {
        if (typeof code !== 'object' || code === null) {
            throw new errors_1.SchemaParseError(`errorCodes[${index}] must be an object`);
        }
        const c = code;
        if (!c.code || typeof c.code !== 'string') {
            throw new errors_1.SchemaParseError(`errorCodes[${index}].code must be a non-empty string`);
        }
        if (!c.message || typeof c.message !== 'string') {
            throw new errors_1.SchemaParseError(`errorCodes[${index}].message must be a non-empty string`);
        }
        if (typeof c.httpStatus !== 'number' ||
            !Number.isInteger(c.httpStatus) ||
            c.httpStatus < 100 ||
            c.httpStatus > 599) {
            throw new errors_1.SchemaParseError(`errorCodes[${index}].httpStatus must be an integer between 100 and 599`);
        }
    }
}
exports.JSONSchemaParser = JSONSchemaParser;

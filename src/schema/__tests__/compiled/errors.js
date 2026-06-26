"use strict";
/**
 * Typed error hierarchy for schema processing.
 *
 * INVARIANT [SCHEMA-003]: All thrown errors in schema processing must use
 * this typed hierarchy. Generic Error throws are forbidden in schema modules.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaValidationError = exports.SchemaParseError = exports.SchemaError = void 0;
class SchemaError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SchemaError';
    }
}
exports.SchemaError = SchemaError;
/** Thrown when the input cannot be parsed as valid JSON or fails structural checks. */
class SchemaParseError extends SchemaError {
    constructor(message) {
        super(message);
        this.name = 'SchemaParseError';
    }
}
exports.SchemaParseError = SchemaParseError;
/** Thrown when JSON is structurally valid but semantically invalid (referential integrity, duplicates). */
class SchemaValidationError extends SchemaError {
    constructor(message, validationErrors) {
        super(message);
        this.validationErrors = validationErrors;
        this.name = 'SchemaValidationError';
    }
}
exports.SchemaValidationError = SchemaValidationError;

/**
 * Typed error hierarchy for schema processing.
 *
 * INVARIANT [SCHEMA-003]: All thrown errors in schema processing must use
 * this typed hierarchy. Generic Error throws are forbidden in schema modules.
 */

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

/** Thrown when the input cannot be parsed as valid JSON or fails structural checks. */
export class SchemaParseError extends SchemaError {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaParseError';
  }
}

/** Thrown when JSON is structurally valid but semantically invalid (referential integrity, duplicates). */
export class SchemaValidationError extends SchemaError {
  constructor(
    message: string,
    public readonly validationErrors: string[],
  ) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

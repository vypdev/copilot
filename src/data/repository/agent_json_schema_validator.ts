type JsonSchema = Record<string, unknown>;

/** Validates the JSON Schema subset used by all public agent response contracts. */
export function assertAgentResponseSchema(value: unknown, schema: JsonSchema, path = '$'): void {
    assertType(value, schema.type, path);
    if (Array.isArray(schema.enum) && !schema.enum.some(candidate => Object.is(candidate, value))) {
        throw new Error(`Agent response schema violation at ${path}: value is outside the allowed enum.`);
    }
    if (typeof value === 'string') validateString(value, schema, path);
    if (typeof value === 'number') validateNumber(value, schema, path);
    if (Array.isArray(value)) validateArray(value, schema, path);
    if (isObject(value)) validateObject(value, schema, path);
}

function assertType(value: unknown, expected: unknown, path: string): void {
    if (typeof expected !== 'string') return;
    const valid = expected === 'object' ? isObject(value)
        : expected === 'array' ? Array.isArray(value)
            : expected === 'integer' ? typeof value === 'number' && Number.isInteger(value)
                : typeof value === expected;
    if (!valid) throw new Error(`Agent response schema violation at ${path}: expected ${expected}.`);
}

function validateString(value: string, schema: JsonSchema, path: string): void {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
        throw new Error(`Agent response schema violation at ${path}: string is too short.`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
        throw new Error(`Agent response schema violation at ${path}: string is too long.`);
    }
}

function validateNumber(value: number, schema: JsonSchema, path: string): void {
    if (!Number.isFinite(value)) throw new Error(`Agent response schema violation at ${path}: number is not finite.`);
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
        throw new Error(`Agent response schema violation at ${path}: number is below minimum.`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
        throw new Error(`Agent response schema violation at ${path}: number is above maximum.`);
    }
}

function validateArray(value: unknown[], schema: JsonSchema, path: string): void {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
        throw new Error(`Agent response schema violation at ${path}: array has too few items.`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
        throw new Error(`Agent response schema violation at ${path}: array has too many items.`);
    }
    if (isObject(schema.items)) {
        value.forEach((item, index) => assertAgentResponseSchema(item, schema.items as JsonSchema, `${path}[${index}]`));
    }
}

function validateObject(value: Record<string, unknown>, schema: JsonSchema, path: string): void {
    const properties = isObject(schema.properties) ? schema.properties as Record<string, JsonSchema> : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [];
    for (const property of required) {
        if (!Object.prototype.hasOwnProperty.call(value, property)) {
            throw new Error(`Agent response schema violation at ${path}: missing required property ${property}.`);
        }
    }
    for (const [property, nested] of Object.entries(value)) {
        if (properties[property]) {
            assertAgentResponseSchema(nested, properties[property], `${path}.${property}`);
            continue;
        }
        if (schema.additionalProperties === false) {
            throw new Error(`Agent response schema violation at ${path}: unexpected property ${property}.`);
        }
        if (isObject(schema.additionalProperties)) {
            assertAgentResponseSchema(nested, schema.additionalProperties as JsonSchema, `${path}.${property}`);
        }
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

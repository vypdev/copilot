type JsonSchema = Readonly<Record<string, unknown>>;

/** Enforces the object subset required by strict native structured-output providers. */
export function assertStrictOutputSchema(schema: JsonSchema): void {
    const rootTypes = schemaTypes(schema.type);
    if (rootTypes.length !== 1 || rootTypes[0] !== 'object') {
        throw new Error('Strict output schema root must be an object.');
    }
    assertStrictNode(schema, '$');
}

function assertStrictNode(schema: JsonSchema, path: string): void {
    const types = schemaTypes(schema.type, path);
    if (types.includes('object')) assertStrictObject(schema, path);
    if (types.includes('array')) {
        if (!isRecord(schema.items)) throw new Error(`Strict output schema array ${path} must define item schema.`);
        assertStrictNode(schema.items, `${path}[]`);
    }
}

function assertStrictObject(schema: JsonSchema, path: string): void {
    if (!isRecord(schema.properties)) {
        throw new Error(`Strict output schema object ${path} must define properties.`);
    }
    if (schema.additionalProperties !== false) {
        throw new Error(`Strict output schema object ${path} must deny additional properties.`);
    }
    const properties = Object.keys(schema.properties);
    if (!Array.isArray(schema.required) || schema.required.some(value => typeof value !== 'string')) {
        throw new Error(`Strict output schema object ${path} must define a string required list.`);
    }
    const required = schema.required as string[];
    const distinctRequired = new Set(required);
    if (required.length !== properties.length
        || distinctRequired.size !== properties.length
        || properties.some(property => !distinctRequired.has(property))) {
        throw new Error(`Strict output schema object ${path} must require every property.`);
    }
    for (const [property, nested] of Object.entries(schema.properties)) {
        if (!isRecord(nested)) throw new Error(`Strict output schema property ${path}.${property} is invalid.`);
        assertStrictNode(nested, `${path}.${property}`);
    }
}

function schemaTypes(value: unknown, path = '$'): string[] {
    const types = typeof value === 'string' ? [value] : value;
    const allowed = new Set(['null', 'boolean', 'object', 'array', 'number', 'integer', 'string']);
    if (!Array.isArray(types)
        || types.length === 0
        || types.some(candidate => typeof candidate !== 'string' || !allowed.has(candidate))
        || new Set(types).size !== types.length) {
        throw new Error(`Strict output schema node ${path} must define valid unique JSON types.`);
    }
    return types as string[];
}

function isRecord(value: unknown): value is JsonSchema {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

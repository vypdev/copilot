import { assertStrictOutputSchema } from './strict_output_schema_policy';

type JsonSchema = Readonly<Record<string, unknown>>;

const literalIdentityPaths = new Set([
    '$.findings[].id', '$.findings[].file', '$.findings[].codeSnippet', '$.rejected_ids[]',
]);

/** Keep decoder-incompatible constraints local while retaining the closed native shape. */
export function projectCodexOutputSchema(schema: JsonSchema): Record<string, unknown> {
    return project(schema);
}

/** Exact detector-supplied values belong to the local literal-verification contract. */
export function projectCodexLiteralVerificationSchema(schema: JsonSchema): Record<string, unknown> {
    return project(schema, literalIdentityPaths);
}

function project(schema: JsonSchema, localEnums?: ReadonlySet<string>): Record<string, unknown> {
    assertStrictOutputSchema(schema);
    return projectNode(schema, { remainingEnumValues: 1_000 }, '$', localEnums);
}

function projectNode(schema: JsonSchema, budget: { remainingEnumValues: number }, path: string,
    localEnums?: ReadonlySet<string>): Record<string, unknown> {
    const projected = { ...schema };
    if (Array.isArray(schema.enum)) {
        const stringPoints = schema.enum.reduce<number>((total, value) => total + (typeof value === 'string' ? [...value].length : 0), 0);
        // The native decoder rejects newline-containing string enums. The local
        // validator still checks the original enum, including exact source snippets.
        if (localEnums?.has(path) || schema.enum.some(value => typeof value === 'string' && /[\r\n]/u.test(value))
            || schema.enum.length > budget.remainingEnumValues || (schema.enum.length > 250 && stringPoints > 15_000)) {
            delete projected.enum;
        } else {
            budget.remainingEnumValues -= schema.enum.length;
        }
    }
    const types = typeof schema.type === 'string' ? [schema.type] : schema.type as readonly string[];
    if (types.includes('string')) {
        delete projected.minLength;
        delete projected.maxLength;
    }
    if (types.includes('object')) {
        projected.properties = Object.fromEntries(Object.entries(schema.properties as Record<string, JsonSchema>)
            .map(([name, nested]) => [name, projectNode(nested, budget, `${path}.${name}`, localEnums)]));
    }
    if (types.includes('array')) projected.items = projectNode(schema.items as JsonSchema, budget, `${path}[]`, localEnums);
    return projected;
}

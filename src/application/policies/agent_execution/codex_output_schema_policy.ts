import { assertStrictOutputSchema } from './strict_output_schema_policy';

type JsonSchema = Readonly<Record<string, unknown>>;

/** Keep string-size acceptance local; Codex's native decoder receives the compatible closed shape. */
export function projectCodexOutputSchema(schema: JsonSchema): Record<string, unknown> {
    assertStrictOutputSchema(schema);
    return projectNode(schema);
}

function projectNode(schema: JsonSchema): Record<string, unknown> {
    const projected = { ...schema };
    const types = typeof schema.type === 'string' ? [schema.type] : schema.type as readonly string[];
    if (types.includes('string')) {
        delete projected.minLength;
        delete projected.maxLength;
    }
    if (types.includes('object')) {
        projected.properties = Object.fromEntries(Object.entries(schema.properties as Record<string, JsonSchema>)
            .map(([name, nested]) => [name, projectNode(nested)]));
    }
    if (types.includes('array')) projected.items = projectNode(schema.items as JsonSchema);
    return projected;
}

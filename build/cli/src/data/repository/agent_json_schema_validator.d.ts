type JsonSchema = Record<string, unknown>;
/** Validates the JSON Schema subset used by all public agent response contracts. */
export declare function assertAgentResponseSchema(value: unknown, schema: JsonSchema, path?: string): void;
export {};

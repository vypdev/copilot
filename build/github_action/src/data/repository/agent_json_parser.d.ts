/** Extract the first complete JSON object from prose, respecting quoted strings and escapes. */
export declare function extractFirstJsonObject(text: string): string | null;
/** Parse an agent response that may be raw JSON, fenced JSON, or prose followed by an object. */
export declare function parseJsonFromAgentText(text: string): Record<string, unknown>;

export function buildAgentPrompt(
    prompt: string,
    expectJson: boolean,
    schema: unknown,
    schemaName: string,
): string {
    if (!expectJson || !schema) return prompt;
    return `Respond with a single JSON object that strictly conforms to this schema (name: ${schemaName}). No other text or markdown.\n\nSchema: ${JSON.stringify(schema)}\n\nUser request:\n${prompt}`;
}

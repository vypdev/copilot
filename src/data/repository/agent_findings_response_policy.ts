import { parseJsonFromAgentText } from './agent_json_parser';
import { extractReasoningFromParts, extractTextFromParts } from './agent_response_parser';

export interface FindingsResponseOptions {
    expectJson?: boolean;
    schema?: Record<string, unknown>;
    includeReasoning?: boolean;
}

export function interpretFindingsResponse(
    parts: unknown,
    options: FindingsResponseOptions,
): string | Record<string, unknown> {
    const text = typeof parts === 'string' ? parts : extractTextFromParts(parts);
    if (!text) throw new Error('Empty response text');
    if (!options.expectJson || !options.schema) return text;

    const parsed = parseJsonFromAgentText(text);
    if (options.includeReasoning && typeof parts !== 'string') {
        const reasoning = extractReasoningFromParts(parts);
        if (reasoning) return { ...parsed, reasoning };
    }
    return parsed;
}

import { BugbotResponseFailure, type BugbotResponseFailureReason } from '../../domain/bugbot/response_failure';
import { AgentResponseSchemaFailure } from '../../domain/agent_response_schema_failure';
import { AgentResponseLengthFailure } from '../../domain/agent_response_length_failure';
import { parseStrictJsonFromAgentText } from './agent_json_parser';
import { extractReasoningFromParts, extractTextFromParts } from './agent_response_parser';
import { assertAgentResponseSchema } from './agent_json_schema_validator';

export interface FindingsResponseOptions {
    schemaName?: string;
    expectJson?: boolean;
    schema?: Record<string, unknown>;
    includeReasoning?: boolean;
}

export function interpretFindingsResponse(
    parts: unknown,
    options: FindingsResponseOptions,
): string | Record<string, unknown> {
    const bugbotSchema = options.schemaName === 'bugbot_findings' || options.schemaName === 'bugbot_literal_candidate_verification';
    const text = typeof parts === 'string' ? parts : extractTextFromParts(parts);
    if (!text) {
        if (options.expectJson && options.schema && bugbotSchema) throw new BugbotResponseFailure('json-invalid');
        throw new Error('Empty response text');
    }
    if (!options.expectJson || !options.schema) return text;

    let parsed: Record<string, unknown>;
    try { parsed = parseStrictJsonFromAgentText(text); }
    catch (error) {
        if (bugbotSchema) throw new BugbotResponseFailure('json-invalid');
        throw error;
    }
    try { assertAgentResponseSchema(parsed, options.schema); }
    catch (error) {
        if (bugbotSchema) {
            if (error instanceof AgentResponseLengthFailure) throw new BugbotResponseFailure('schema-string-long');
            if (error instanceof AgentResponseSchemaFailure) throw new BugbotResponseFailure(`schema-${error.reason}` as BugbotResponseFailureReason);
        }
        throw error;
    }
    if (options.includeReasoning && typeof parts !== 'string') {
        const reasoning = extractReasoningFromParts(parts);
        if (reasoning) return { ...parsed, reasoning };
    }
    return parsed;
}

import { extractTextFromParts } from './agent_response_parser';

export interface FixerAgentResponse {
    text: string;
    sessionId: string;
}

export function interpretFixerResponse(parts: unknown, sessionId: string): FixerAgentResponse {
    const text = extractTextFromParts(parts);
    if (!text) throw new Error('Empty response text');
    return { text, sessionId };
}

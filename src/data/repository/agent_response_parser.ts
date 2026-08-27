export interface AgentMessagePart {
    type?: string;
    text?: string;
}

export function extractPartsByType(parts: unknown, type: string, joinWith: string): string {
    if (!Array.isArray(parts)) return '';
    return (parts as AgentMessagePart[])
        .filter((part) => part?.type === type && typeof part.text === 'string')
        .map((part) => part.text as string)
        .join(joinWith)
        .trim();
}

export function extractTextFromParts(parts: unknown): string {
    return extractPartsByType(parts, 'text', '');
}

export function extractReasoningFromParts(parts: unknown): string {
    return extractPartsByType(parts, 'reasoning', '\n\n');
}

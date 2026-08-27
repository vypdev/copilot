export interface AgentMessagePart {
    type?: string;
    text?: string;
}
export declare function extractPartsByType(parts: unknown, type: string, joinWith: string): string;
export declare function extractTextFromParts(parts: unknown): string;
export declare function extractReasoningFromParts(parts: unknown): string;

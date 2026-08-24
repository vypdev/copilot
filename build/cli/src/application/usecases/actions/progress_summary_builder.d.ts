export interface ProgressSummaryInput {
    summary: string;
    progress: number;
    remaining?: string;
    reasoning?: string;
}
export declare function isReasoningLikelyTruncated(reasoning: string): boolean;
export declare function buildProgressSummaryMessage({ summary, progress, remaining, reasoning }: ProgressSummaryInput): string;

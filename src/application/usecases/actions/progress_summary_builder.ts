export interface ProgressSummaryInput {
    summary: string;
    progress: number;
    remaining?: string;
    reasoning?: string;
}

export function isReasoningLikelyTruncated(reasoning: string): boolean {
    const trimmed = reasoning.trim();
    if (trimmed.length === 0) return false;
    const lastChar = trimmed.slice(-1);
    return /[:\s]$/.test(trimmed) || !/[.!?\n]$/.test(lastChar);
}

export function buildProgressSummaryMessage({ summary, progress, remaining, reasoning }: ProgressSummaryInput): string {
    let message = `**Analysis**: ${summary}`;
    if (progress < 100 && remaining) {
        message += `\n\n## 🤷 What's left to reach 100%\n\n${remaining}`;
    }
    if (reasoning) {
        const truncationNote = isReasoningLikelyTruncated(reasoning)
            ? '\n\n_Reasoning may be truncated by the model._'
            : '';
        message += `\n\n## 🧠 Reasoning\n${reasoning}${truncationNote}`;
    }
    return message;
}

export const PROGRESS_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        progress: { type: 'number', description: 'Completion percentage 0-100' },
        summary: { type: 'string', description: 'Short explanation of the assessment' },
        remaining: { type: 'string', description: 'When progress < 100: what is left to do to reach 100%. Omit or empty when progress is 100.' },
    },
    required: ['progress', 'summary'],
    additionalProperties: false,
} as const;

export interface ProgressAttemptResult {
    progress: number;
    summary: string;
    reasoning: string;
    remaining: string;
}

export function parseProgressResponse(response: unknown): ProgressAttemptResult {
    const payload = response && typeof response === 'object' ? response as Record<string, unknown> : {};
    const rawProgress = typeof payload.progress === 'number' ? payload.progress : 0;
    return {
        progress: Math.min(100, Math.max(0, Math.round(rawProgress))),
        summary: typeof payload.summary === 'string' ? payload.summary : 'Unable to determine progress.',
        reasoning: typeof payload.reasoning === 'string' ? payload.reasoning.trim() : '',
        remaining: typeof payload.remaining === 'string' ? payload.remaining.trim() : '',
    };
}

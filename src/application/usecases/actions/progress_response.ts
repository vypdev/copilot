import { AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY, agentOutputLocaleFailureMessage, validateAgentOutputLocale } from '../../policies/agent_output_locale_policy';
import { ApplicationError } from '../../errors/application_error';

export const PROGRESS_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        outputLocale: AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY,
        progress: { type: 'number', minimum: 0, maximum: 100, description: 'Completion percentage 0-100' },
        summary: { type: 'string', minLength: 1, maxLength: 8_000, description: 'Short explanation of the assessment' },
        remaining: { type: ['string', 'null'], maxLength: 8_000, description: 'When progress < 100: what is left to do to reach 100%; otherwise null.' },
    },
    required: ['outputLocale', 'progress', 'summary', 'remaining'],
    additionalProperties: false,
} as const;

export interface ProgressAttemptResult {
    progress: number;
    summary: string;
    reasoning: string;
    remaining: string;
}

export function parseProgressResponse(response: unknown, targetLocale: string): ProgressAttemptResult {
    const validation = validateAgentOutputLocale(response, targetLocale);
    if (validation.kind === 'invalid') {
        throw new ApplicationError('locale.output-invalid', agentOutputLocaleFailureMessage(validation));
    }
    const payload = validation.payload;
    const rawProgress = typeof payload.progress === 'number' ? payload.progress : 0;
    return {
        progress: Math.min(100, Math.max(0, Math.round(rawProgress))),
        summary: typeof payload.summary === 'string' ? payload.summary : 'Unable to determine progress.',
        reasoning: typeof payload.reasoning === 'string' ? payload.reasoning.trim() : '',
        remaining: typeof payload.remaining === 'string' ? payload.remaining.trim() : '',
    };
}

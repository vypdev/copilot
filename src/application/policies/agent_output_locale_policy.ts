import { canonicalizeLocaleTag } from '../../domain/locale';

export const PRODUCT_FACING_AGENT_TASKS = [
    'think',
    'answer-issue-help',
    'progress',
    'recommend-steps',
    'pull-request-description',
    'bugbot-review',
] as const;

export type ProductFacingAgentTask = typeof PRODUCT_FACING_AGENT_TASKS[number];

const PRODUCT_FACING_AGENT_SCHEMA_NAMES: Readonly<Record<ProductFacingAgentTask, string>> = Object.freeze({
    think: 'think_response',
    'answer-issue-help': 'answer_issue_help_response',
    progress: 'progress_response',
    'recommend-steps': 'recommend_steps_response',
    'pull-request-description': 'pull_request_description_response',
    'bugbot-review': 'bugbot_findings',
});

export const AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY = {
    type: 'string',
    minLength: 1,
    maxLength: 255,
    description: 'The exact canonical BCP-47 locale requested in targetLocale.',
} as const;

export type AgentOutputLocaleFailureReason =
    | 'response-not-object'
    | 'output-locale-missing'
    | 'output-locale-invalid'
    | 'output-locale-mismatch';

export type AgentOutputLocaleValidation =
    | {
        readonly kind: 'valid';
        readonly expectedLocale: string;
        readonly payload: Readonly<Record<string, unknown>>;
    }
    | {
        readonly kind: 'invalid';
        readonly expectedLocale: string;
        readonly reason: AgentOutputLocaleFailureReason;
        readonly actualLocale?: string;
    };

interface ProductFacingResponseSchema {
    readonly properties?: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
}

/**
 * Builds the only supported structured-output options for product-facing agent
 * calls. Runtime assertions make an accidentally weakened schema fail before
 * an agent provider is invoked.
 */
export function productFacingAgentQueryOptions(
    task: ProductFacingAgentTask,
    schema: ProductFacingResponseSchema,
): {
    readonly expectJson: true;
    readonly schema: Record<string, unknown>;
    readonly schemaName: string;
} {
    if (!schema.properties?.outputLocale || !schema.required?.includes('outputLocale')) {
        throw new TypeError(`Product-facing agent schema for ${task} must require outputLocale.`);
    }
    return Object.freeze({
        expectJson: true,
        schema: schema as unknown as Record<string, unknown>,
        schemaName: PRODUCT_FACING_AGENT_SCHEMA_NAMES[task],
    });
}

/** Validates locale metadata before any model prose can reach product state. */
export function validateAgentOutputLocale(
    response: unknown,
    targetLocale: string,
): AgentOutputLocaleValidation {
    const expectedLocale = canonicalizeLocaleTag(targetLocale);
    if (response == null || typeof response !== 'object' || Array.isArray(response)) {
        return Object.freeze({ kind: 'invalid', expectedLocale, reason: 'response-not-object' });
    }
    const payload = response as Record<string, unknown>;
    if (typeof payload.outputLocale !== 'string' || !payload.outputLocale.trim()) {
        return Object.freeze({ kind: 'invalid', expectedLocale, reason: 'output-locale-missing' });
    }
    let actualLocale: string;
    try {
        actualLocale = canonicalizeLocaleTag(payload.outputLocale);
    } catch {
        return Object.freeze({
            kind: 'invalid',
            expectedLocale,
            reason: 'output-locale-invalid',
        });
    }
    if (actualLocale !== expectedLocale || payload.outputLocale !== expectedLocale) {
        return Object.freeze({
            kind: 'invalid',
            expectedLocale,
            actualLocale,
            reason: 'output-locale-mismatch',
        });
    }
    return Object.freeze({ kind: 'valid', expectedLocale, payload: Object.freeze({ ...payload }) });
}

export function agentOutputLocaleFailureMessage(validation: Extract<AgentOutputLocaleValidation, { kind: 'invalid' }>): string {
    return `Configured agent output was rejected before publication (${validation.reason}; expected ${validation.expectedLocale}).`;
}

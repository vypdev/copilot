/** Shared structured-response contracts used by agent-backed application flows. */

export const LANGUAGE_ADAPTATION_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        status: {
            type: 'string',
            enum: ['matches', 'translated', 'ambiguous', 'failed'],
            description: 'Whether the input already matches, was translated, is ambiguous, or could not be adapted.',
        },
        sourceLocale: {
            type: ['string', 'null'],
            maxLength: 255,
            description: 'Detected canonical BCP-47 source locale when known.',
        },
        targetLocale: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
            description: 'The requested canonical BCP-47 target locale.',
        },
        adaptedText: {
            type: ['string', 'null'],
            maxLength: 12_000,
            description: 'Target-locale interpretation, or null when no translation was needed or possible.',
        },
        reason: {
            type: ['string', 'null'],
            maxLength: 2_000,
            description: 'Bounded reason for ambiguous or failed adaptation, otherwise null.',
        },
    },
    required: ['status', 'sourceLocale', 'targetLocale', 'adaptedText', 'reason'],
    additionalProperties: false,
} as const;

/** @deprecated Use the single-call language-adaptation schema. */
export const TRANSLATION_RESPONSE_SCHEMA = LANGUAGE_ADAPTATION_RESPONSE_SCHEMA;

export const THINK_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        answer: {
            type: 'string',
            minLength: 1,
            maxLength: 12_000,
            description: 'The concise answer to the user question. Required.',
        },
    },
    required: ['answer'],
    additionalProperties: false,
} as const;

/** @deprecated Retained for API compatibility; runtime adaptation uses one combined schema. */
export const LANGUAGE_CHECK_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        status: { type: 'string', enum: ['done', 'must_translate'] },
    },
    required: ['status'],
    additionalProperties: false,
} as const;

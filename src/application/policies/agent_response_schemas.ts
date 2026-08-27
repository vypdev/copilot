/** Shared structured-response contracts used by agent-backed application flows. */

export const TRANSLATION_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        translatedText: {
            type: 'string',
            description: 'The text translated to the requested locale. Required. Must not be empty.',
        },
        reason: {
            type: 'string',
            description:
                'Optional: reason why translation could not be produced or was partial (e.g. ambiguous input).',
        },
    },
    required: ['translatedText'],
    additionalProperties: false,
} as const;

export const THINK_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        answer: {
            type: 'string',
            description: 'The concise answer to the user question. Required.',
        },
    },
    required: ['answer'],
    additionalProperties: false,
} as const;

export const LANGUAGE_CHECK_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        status: {
            type: 'string',
            enum: ['done', 'must_translate'],
            description: 'done if text is in the requested locale, must_translate otherwise.',
        },
    },
    required: ['status'],
    additionalProperties: false,
} as const;

/** Shared structured-response contracts used by agent-backed application flows. */

export const TRANSLATION_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        translatedText: {
            type: ['string', 'null'],
            maxLength: 12_000,
            description: 'The translated text, or null when translation cannot be produced.',
        },
        reason: {
            type: ['string', 'null'],
            maxLength: 2_000,
            description:
                'Reason why translation could not be produced, or null when translation succeeded.',
        },
    },
    required: ['translatedText', 'reason'],
    additionalProperties: false,
} as const;

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

/** Shared structured-response contracts used by agent-backed application flows. */

import { AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY } from './agent_output_locale_policy';

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
        reasonCode: {
            type: 'string',
            enum: ['none', 'mixed-language', 'code-only', 'too-short', 'unsafe-input', 'provider-failure', 'unknown'],
            description: 'Stable reason code; none for matches or translated.',
        },
    },
    required: ['status', 'sourceLocale', 'targetLocale', 'adaptedText', 'reasonCode'],
    additionalProperties: false,
} as const;

/** @deprecated Use the single-call language-adaptation schema. */
export const TRANSLATION_RESPONSE_SCHEMA = LANGUAGE_ADAPTATION_RESPONSE_SCHEMA;

export const THINK_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        outputLocale: AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY,
        answer: {
            type: 'string',
            minLength: 1,
            maxLength: 12_000,
            description: 'The concise answer to the user question. Required.',
        },
    },
    required: ['outputLocale', 'answer'],
    additionalProperties: false,
} as const;

export const RECOMMEND_STEPS_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        outputLocale: AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY,
        status: {
            type: 'string',
            enum: ['recommendation', 'unchanged'],
            description: 'Whether a recommendation is present or the previous recommendation remains valid.',
        },
        steps: {
            type: ['array', 'null'],
            minItems: 3,
            maxItems: 8,
            items: {
                type: 'object',
                properties: {
                    title: { type: 'string', minLength: 1, maxLength: 200 },
                    details: {
                        type: 'array',
                        maxItems: 2,
                        items: { type: 'string', minLength: 1, maxLength: 300 },
                    },
                },
                required: ['title', 'details'],
                additionalProperties: false,
            },
            description: 'Three to eight ordered implementation steps; null when status is unchanged.',
        },
        acceptance: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 800,
            description: 'One verifiable completion criterion; null when status is unchanged.',
        },
    },
    required: ['outputLocale', 'status', 'steps', 'acceptance'],
    additionalProperties: false,
} as const;

export const PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        outputLocale: AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY,
        overview: {
            type: 'string',
            minLength: 1,
            maxLength: 1_500,
            description: 'One to three sentences describing the outcome and why it matters.',
        },
        whatChangedHeading: { type: 'string', minLength: 1, maxLength: 100 },
        changes: {
            type: 'array',
            minItems: 2,
            maxItems: 6,
            items: { type: 'string', minLength: 1, maxLength: 1_000 },
        },
        validationHeading: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
        validation: {
            type: ['array', 'null'],
            minItems: 1,
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 1_000 },
        },
        reviewNotesHeading: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
        reviewNotes: {
            type: ['array', 'null'],
            minItems: 1,
            maxItems: 4,
            items: { type: 'string', minLength: 1, maxLength: 1_000 },
        },
        closesLinkedIssue: {
            type: 'boolean',
            description: 'Whether this PR fully resolves the separate linked issue supplied by the application.',
        },
    },
    required: [
        'outputLocale',
        'overview',
        'whatChangedHeading',
        'changes',
        'validationHeading',
        'validation',
        'reviewNotesHeading',
        'reviewNotes',
        'closesLinkedIssue',
    ],
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

/**
 * JSON schemas for findings-agent responses. Used with the findings query so the agent returns
 * structured JSON we can parse.
 */

import { MAX_FINDING_ID_LENGTH } from '../../../../policies/bugbot_finding_marker_policy';

/** Detection returns findings and explicit lifecycle changes for prior finding IDs. */
export const BUGBOT_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        findings: {
            type: 'array',
            maxItems: 200,
            items: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        minLength: 1,
                        maxLength: MAX_FINDING_ID_LENGTH,
                        description: 'Stable unique id for this finding (e.g. file:line:summary)',
                    },
                    title: { type: 'string', minLength: 1, maxLength: 500, description: 'Short title of the problem' },
                    description: { type: 'string', minLength: 1, maxLength: 8000, description: 'Clear explanation of the issue' },
                    file: { type: ['string', 'null'], maxLength: 500, description: 'Repository-relative path, or null when no precise file applies' },
                    line: { type: ['integer', 'null'], minimum: 1, description: 'Line number, or null when no precise line applies' },
                    endLine: { type: ['integer', 'null'], minimum: 1, description: 'Inclusive final line, or null when no range applies' },
                    severity: { type: ['string', 'null'], enum: ['high', 'medium', 'low', 'info', null], description: 'Severity, or null only when it cannot be assigned' },
                    confidence: { type: ['number', 'null'], minimum: 0, maximum: 1, description: 'Confidence from 0 to 1, or null when unavailable' },
                    category: { type: ['string', 'null'], enum: ['correctness', 'security', 'performance', 'reliability', 'maintainability', null], description: 'Primary defect category, or null when unavailable' },
                    evidence: { type: ['string', 'null'], maxLength: 8000, description: 'Concrete evidence, or null when unavailable' },
                    suggestion: { type: ['string', 'null'], maxLength: 8000, description: 'Suggested fix, or null when no safe suggestion applies' },
                    symbol: { type: ['string', 'null'], maxLength: 500, description: 'Nearest stable symbol, or null when unavailable' },
                    codeSnippet: { type: ['string', 'null'], maxLength: 2000, description: 'Minimal exact code fragment, or null when unavailable' },
                    suggestedCode: { type: ['string', 'null'], maxLength: 4000, description: 'Exact replacement text, or null for non-local or uncertain fixes' },
                },
                required: [
                    'id', 'title', 'description', 'file', 'line', 'endLine', 'severity',
                    'confidence', 'category', 'evidence', 'suggestion', 'symbol', 'codeSnippet',
                    'suggestedCode',
                ],
                additionalProperties: false,
            },
        },
        resolved_findings: {
            type: 'array',
            maxItems: 500,
            items: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        minLength: 1,
                        maxLength: MAX_FINDING_ID_LENGTH,
                        description: 'Exact id of a retained previously reported finding',
                    },
                    resolution: {
                        type: 'string',
                        enum: ['fixed', 'obsolete'],
                        description: 'Whether the defect was fixed or its original situation no longer applies',
                    },
                },
                required: ['id', 'resolution'],
                additionalProperties: false,
            },
            description: 'Retained previous findings that are now fixed or obsolete; use an empty array when none are resolved.',
        },
    },
    required: ['findings', 'resolved_findings'],
    additionalProperties: false,
} as const;

/**
 * Findings-agent response schema for comment intent.
 * Given the user comment and the list of unresolved findings, the agent decides whether
 * the user is asking to fix findings, apply a general change, or run a read-only review.
 */
export const BUGBOT_FIX_INTENT_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        is_fix_request: {
            type: 'boolean',
            description:
                'True if the user comment is clearly requesting to fix one or more of the reported findings (e.g. "fix it", "arregla", "fix this vulnerability", "fix all"). False for questions, unrelated messages, or ambiguous text.',
        },
        target_finding_ids: {
            type: 'array',
            maxItems: 500,
            items: { type: 'string', minLength: 1, maxLength: MAX_FINDING_ID_LENGTH },
            description:
                'When is_fix_request is true: the exact finding ids from the list we provided that the user wants fixed. Use the exact id strings. For "fix all" or "fix everything" include all listed ids. When is_fix_request is false, return an empty array.',
        },
        is_do_request: {
            type: 'boolean',
            description:
                'True if the user is asking to perform some change or task in the repository (e.g. "add a test for X", "refactor this", "implement feature Y"). False for pure questions or when the only intent is to fix the reported findings (use is_fix_request for that).',
        },
        is_review_request: {
            type: 'boolean',
            description:
                'True if the user is asking for a read-only analysis or review of the current issue, branch, or pull request (e.g. "analyze the changes for security issues", "review this PR for bugs"). False for pure questions or file-changing requests.',
        },
    },
    required: ['is_fix_request', 'target_finding_ids', 'is_do_request', 'is_review_request'],
    additionalProperties: false,
} as const;

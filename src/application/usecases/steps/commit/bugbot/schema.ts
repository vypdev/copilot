/**
 * JSON schemas for findings-agent responses. Used with the findings query so the agent returns
 * structured JSON we can parse.
 */

import { MAX_FINDING_ID_LENGTH } from './marker';

/** Detection returns findings and explicit lifecycle changes for prior finding IDs. */
export const BUGBOT_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        findings: {
            type: 'array',
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
                    file: { type: 'string', maxLength: 500, description: 'Repository-relative path when applicable' },
                    line: { type: 'integer', minimum: 1, description: 'Line number when applicable' },
                    endLine: { type: 'integer', minimum: 1, description: 'Inclusive final line when the problem spans multiple diff lines' },
                    severity: { type: 'string', enum: ['high', 'medium', 'low', 'info'], description: 'Severity. Findings below the configured minimum are not published.' },
                    confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Confidence that the finding is a real, actionable defect' },
                    category: { type: 'string', enum: ['correctness', 'security', 'performance', 'reliability', 'maintainability'], description: 'Primary defect category' },
                    evidence: { type: 'string', maxLength: 8000, description: 'Concrete execution path, invariant, or code evidence proving impact' },
                    suggestion: { type: 'string', maxLength: 8000, description: 'Suggested fix when applicable' },
                },
                required: ['id', 'title', 'description'],
                additionalProperties: false,
            },
        },
        resolved_finding_ids: {
            type: 'array',
            items: {
                type: 'string',
                minLength: 1,
                maxLength: MAX_FINDING_ID_LENGTH,
            },
            description:
                'Ids of previously reported issues (from the list we sent) that are now fixed in the current code. Only include ids we asked you to check.',
        },
        resolved_finding_reasons: {
            type: 'object',
            additionalProperties: {
                type: 'string',
                enum: ['fixed', 'obsolete'],
            },
            description: 'Optional map from a previously reported finding id to fixed or obsolete. Only ids from the supplied previous-findings list are accepted.',
        },
    },
    required: ['findings'],
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
            items: { type: 'string' },
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

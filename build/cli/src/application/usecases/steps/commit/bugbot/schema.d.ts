/**
 * JSON schemas for findings-agent responses. Used with the findings query so the agent returns
 * structured JSON we can parse.
 */
/** Detection (on push): the configured agent computes the diff and returns findings + resolved_finding_ids. */
export declare const BUGBOT_RESPONSE_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly findings: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                        readonly minLength: 1;
                        readonly maxLength: 200;
                        readonly description: "Stable unique id for this finding (e.g. file:line:summary)";
                    };
                    readonly title: {
                        readonly type: "string";
                        readonly minLength: 1;
                        readonly maxLength: 500;
                        readonly description: "Short title of the problem";
                    };
                    readonly description: {
                        readonly type: "string";
                        readonly minLength: 1;
                        readonly maxLength: 8000;
                        readonly description: "Clear explanation of the issue";
                    };
                    readonly file: {
                        readonly type: "string";
                        readonly maxLength: 500;
                        readonly description: "Repository-relative path when applicable";
                    };
                    readonly line: {
                        readonly type: "integer";
                        readonly minimum: 1;
                        readonly description: "Line number when applicable";
                    };
                    readonly severity: {
                        readonly type: "string";
                        readonly enum: readonly ["high", "medium", "low", "info"];
                        readonly description: "Severity. Findings below the configured minimum are not published.";
                    };
                    readonly suggestion: {
                        readonly type: "string";
                        readonly maxLength: 8000;
                        readonly description: "Suggested fix when applicable";
                    };
                };
                readonly required: readonly ["id", "title", "description"];
                readonly additionalProperties: false;
            };
        };
        readonly resolved_finding_ids: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
                readonly minLength: 1;
                readonly maxLength: 200;
            };
            readonly description: "Ids of previously reported issues (from the list we sent) that are now fixed in the current code. Only include ids we asked you to check.";
        };
        readonly resolved_finding_reasons: {
            readonly type: "object";
            readonly additionalProperties: {
                readonly type: "string";
                readonly enum: readonly ["fixed", "obsolete"];
            };
            readonly description: "Optional map from a previously reported finding id to fixed or obsolete. Only ids from the supplied previous-findings list are accepted.";
        };
    };
    readonly required: readonly ["findings"];
    readonly additionalProperties: false;
};
/**
 * Findings-agent response schema for bugbot fix intent.
 * Given the user comment and the list of unresolved findings, the agent decides whether
 * the user is asking to fix one or more of them and which finding ids to target.
 */
export declare const BUGBOT_FIX_INTENT_RESPONSE_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly is_fix_request: {
            readonly type: "boolean";
            readonly description: "True if the user comment is clearly requesting to fix one or more of the reported findings (e.g. \"fix it\", \"arregla\", \"fix this vulnerability\", \"fix all\"). False for questions, unrelated messages, or ambiguous text.";
        };
        readonly target_finding_ids: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
            readonly description: "When is_fix_request is true: the exact finding ids from the list we provided that the user wants fixed. Use the exact id strings. For \"fix all\" or \"fix everything\" include all listed ids. When is_fix_request is false, return an empty array.";
        };
        readonly is_do_request: {
            readonly type: "boolean";
            readonly description: "True if the user is asking to perform some change or task in the repository (e.g. \"add a test for X\", \"refactor this\", \"implement feature Y\"). False for pure questions or when the only intent is to fix the reported findings (use is_fix_request for that).";
        };
    };
    readonly required: readonly ["is_fix_request", "target_finding_ids", "is_do_request"];
    readonly additionalProperties: false;
};

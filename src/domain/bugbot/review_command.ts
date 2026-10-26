import type { CopilotCommandValidationReason } from '../copilot_command_validation';
import type { BugbotReviewConfiguration, BugbotReviewEffort } from './review_configuration';

export interface BugbotReviewCommandOverrides {
    publicationMode?: BugbotReviewConfiguration['publicationMode'];
    effort?: BugbotReviewConfiguration['effort'];
    traceRules?: boolean;
    suggestedChanges?: boolean;
}

export type BugbotReviewCommandParseResult =
    | { readonly valid: true; readonly overrides: BugbotReviewCommandOverrides }
    | { readonly valid: false; readonly reason: string; readonly validationReason: CopilotCommandValidationReason };

const EFFORTS = new Set<BugbotReviewEffort>(['low', 'default', 'high', 'smart']);

/** Parses a deliberately small, provider-neutral set of per-review overrides. */
export function parseBugbotReviewCommandOptions(arguments_: readonly string[]): BugbotReviewCommandParseResult {
    const overrides: BugbotReviewCommandOverrides = {};
    for (const argument of arguments_) {
        const separator = argument.indexOf('=');
        if (separator <= 0) return invalid('comment-command-review-format', 'Invalid review option. Use key=value.');
        const key = argument.slice(0, separator).toLowerCase();
        const value = argument.slice(separator + 1).toLowerCase();
        if (key === 'effort') {
            if (!EFFORTS.has(value as BugbotReviewEffort)) return invalid('comment-command-review-effort', 'effort must be low, default, high, or smart.');
            overrides.effort = value as BugbotReviewEffort;
            continue;
        }
        if (!['dry-run', 'trace-rules', 'suggested-changes'].includes(key)) {
            return invalid('comment-command-review-option', 'Unknown review option.');
        }
        const booleanValue = parseBoolean(value);
        if (booleanValue === undefined) return invalid('comment-command-review-boolean', 'Boolean review options must be true or false.');
        if (key === 'dry-run') overrides.publicationMode = booleanValue ? 'dry-run' : 'publish';
        else if (key === 'trace-rules') overrides.traceRules = booleanValue;
        else if (key === 'suggested-changes') overrides.suggestedChanges = booleanValue;
    }
    return { valid: true, overrides };
}

function parseBoolean(value: string): boolean | undefined {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
}

function invalid(validationReason: CopilotCommandValidationReason, reason: string): BugbotReviewCommandParseResult {
    return { valid: false, validationReason, reason: `${reason} Supported options: effort, dry-run, trace-rules, suggested-changes.` };
}

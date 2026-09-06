import type { BugbotReviewConfiguration } from './review_configuration';
export interface BugbotReviewCommandOverrides {
    publicationMode?: BugbotReviewConfiguration['publicationMode'];
    effort?: BugbotReviewConfiguration['effort'];
    traceRules?: boolean;
    suggestedChanges?: boolean;
}
export type BugbotReviewCommandParseResult = {
    readonly valid: true;
    readonly overrides: BugbotReviewCommandOverrides;
} | {
    readonly valid: false;
    readonly reason: string;
};
/** Parses a deliberately small, provider-neutral set of per-review overrides. */
export declare function parseBugbotReviewCommandOptions(arguments_: readonly string[]): BugbotReviewCommandParseResult;

export type BugbotReviewEffort = 'low' | 'default' | 'high' | 'smart';
export type BugbotPublicationMode = 'publish' | 'dry-run';
export interface BugbotShadowConfiguration {
    readonly provider?: string;
    readonly modelProvider?: string;
    readonly model?: string;
    readonly effort?: string;
    readonly allowedModelProviders?: string;
    readonly allowedModels?: string;
}
export interface BugbotReviewConfiguration {
    readonly publicationMode: BugbotPublicationMode;
    readonly effort: BugbotReviewEffort;
    readonly reviewDrafts: boolean;
    readonly traceRules: boolean;
    readonly suggestedChanges: boolean;
    readonly telemetry: boolean;
    readonly failOnUnresolved: boolean;
    readonly organizationRules: readonly string[];
    readonly shadowVerification?: BugbotShadowConfiguration;
}
export declare const DEFAULT_BUGBOT_REVIEW_CONFIGURATION: BugbotReviewConfiguration;
export declare function normalizeBugbotReviewConfiguration(value: Partial<BugbotReviewConfiguration> | undefined): BugbotReviewConfiguration;
/** Organization rules use line/semicolon boundaries so commas remain valid prose. */
export declare function parseBugbotOrganizationRules(value: unknown): string[];
export declare function normalizeBugbotReviewEffort(value: unknown): BugbotReviewEffort;
export interface BugbotChangeComplexity {
    readonly files: number;
    readonly additions: number;
    readonly deletions: number;
    readonly touchesSensitivePath?: boolean;
}
/** Converts the user-facing smart setting into a deterministic execution policy. */
export declare function resolveBugbotReviewEffort(configured: BugbotReviewEffort, complexity: BugbotChangeComplexity): Exclude<BugbotReviewEffort, 'smart'>;

export type BugbotReviewEffort = 'low' | 'default' | 'high' | 'smart';
export type BugbotPublicationMode = 'publish' | 'dry-run';

export interface BugbotReviewConfiguration {
    readonly publicationMode: BugbotPublicationMode;
    readonly effort: BugbotReviewEffort;
    readonly reviewDrafts: boolean;
    readonly traceRules: boolean;
    readonly suggestedChanges: boolean;
    readonly telemetry: boolean;
    readonly failOnUnresolved: boolean;
    readonly organizationRules: readonly string[];
}

export const DEFAULT_BUGBOT_REVIEW_CONFIGURATION: BugbotReviewConfiguration = {
    publicationMode: 'publish',
    effort: 'default',
    reviewDrafts: false,
    traceRules: false,
    suggestedChanges: true,
    telemetry: true,
    failOnUnresolved: false,
    organizationRules: [],
};

export function normalizeBugbotReviewConfiguration(
    value: Partial<BugbotReviewConfiguration> | undefined,
): BugbotReviewConfiguration {
    return {
        publicationMode: value?.publicationMode === 'dry-run' ? 'dry-run' : 'publish',
        effort: normalizeBugbotReviewEffort(value?.effort),
        reviewDrafts: value?.reviewDrafts === true,
        traceRules: value?.traceRules === true,
        suggestedChanges: value?.suggestedChanges !== false,
        telemetry: value?.telemetry !== false,
        failOnUnresolved: value?.failOnUnresolved === true,
        organizationRules: (value?.organizationRules ?? [])
            .map((rule) => rule.normalize('NFKC').trim())
            .filter(Boolean)
            .slice(0, 100),
    };
}

/** Organization rules use line/semicolon boundaries so commas remain valid prose. */
export function parseBugbotOrganizationRules(value: unknown): string[] {
    return String(value ?? '')
        .split(/\r?\n|;/u)
        .map((rule) => rule.normalize('NFKC').trim())
        .filter(Boolean)
        .slice(0, 100);
}

export function normalizeBugbotReviewEffort(value: unknown): BugbotReviewEffort {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return ['low', 'high', 'smart'].includes(normalized)
        ? normalized as BugbotReviewEffort
        : 'default';
}

export interface BugbotChangeComplexity {
    readonly files: number;
    readonly additions: number;
    readonly deletions: number;
    readonly touchesSensitivePath?: boolean;
}

/** Converts the user-facing smart setting into a deterministic execution policy. */
export function resolveBugbotReviewEffort(
    configured: BugbotReviewEffort,
    complexity: BugbotChangeComplexity,
): Exclude<BugbotReviewEffort, 'smart'> {
    if (configured !== 'smart') return configured;
    const changedLines = complexity.additions + complexity.deletions;
    if (complexity.touchesSensitivePath || complexity.files >= 20 || changedLines >= 800) return 'high';
    // Zero here commonly means that a push has no canonical PR snapshot, not
    // that the change is empty. Unknown scope must not be treated as tiny.
    if (complexity.files === 0 && changedLines === 0) return 'default';
    if (complexity.files <= 2 && changedLines <= 80) return 'low';
    return 'default';
}

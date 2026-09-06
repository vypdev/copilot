export declare const PULL_REQUEST_DESCRIPTION_MODES: readonly ["replace", "append", "preserve", "disabled"];
export type PullRequestDescriptionMode = typeof PULL_REQUEST_DESCRIPTION_MODES[number];
export declare const DEFAULT_PULL_REQUEST_DESCRIPTION_MODE: PullRequestDescriptionMode;
export declare const MANAGED_PULL_REQUEST_DESCRIPTION_START = "<!-- copilot:managed-pr-description -->";
export declare const MANAGED_PULL_REQUEST_DESCRIPTION_END = "<!-- /copilot:managed-pr-description -->";
/** Normalizes public configuration while keeping invalid values safe and backwards compatible. */
export declare function normalizePullRequestDescriptionMode(value: unknown): PullRequestDescriptionMode;
export declare function hasManagedPullRequestDescription(body: unknown): boolean;
/** Renders one bounded Copilot-owned section without taking ownership of the rest of the body. */
export declare function renderManagedPullRequestDescription(generated: string): string;
/** Replaces the existing managed section, or appends one when none exists. */
export declare function mergeManagedPullRequestDescription(currentBody: unknown, generated: string): string;
export declare function shouldAutomaticallyUpdatePullRequestDescription(mode: PullRequestDescriptionMode): boolean;

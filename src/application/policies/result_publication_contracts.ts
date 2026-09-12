import type { ApplicationErrorPresentation } from './application_error_presentation_policy';

export interface ResultPublicationImages {
    readonly imagesOnIssue: boolean;
    readonly issueAutomaticActions: readonly string[];
    readonly issueFeatureGifs: readonly string[];
    readonly issueBugfixGifs: readonly string[];
    readonly issueReleaseGifs: readonly string[];
    readonly issueHotfixGifs: readonly string[];
    readonly issueDocsGifs: readonly string[];
    readonly issueChoreGifs: readonly string[];
    readonly imagesOnPullRequest: boolean;
    readonly pullRequestAutomaticActions: readonly string[];
    readonly pullRequestFeatureGifs: readonly string[];
    readonly pullRequestBugfixGifs: readonly string[];
    readonly pullRequestReleaseGifs: readonly string[];
    readonly pullRequestHotfixGifs: readonly string[];
    readonly pullRequestDocsGifs: readonly string[];
    readonly pullRequestChoreGifs: readonly string[];
}

export interface ResultPublicationContext {
    readonly isIssue: boolean;
    readonly isPullRequest: boolean;
    readonly issueNotBranched: boolean;
    readonly releaseActive: boolean;
    readonly hotfixActive: boolean;
    readonly isBugfix: boolean;
    readonly isFeature: boolean;
    readonly isDocs: boolean;
    readonly isChore: boolean;
    readonly images: ResultPublicationImages;
}

export interface ResultPublicationPresentation {
    readonly title: string;
    readonly image?: string;
}

export interface ResultPublicationSections {
    readonly content: string;
    readonly footer: string;
    readonly errors: string;
}

export interface ResultPublicationTargetInput {
    readonly isSingleAction: boolean;
    readonly singleActionIssue: number;
    readonly isIssue: boolean;
    readonly issueNumber: number;
    readonly isPullRequest: boolean;
    readonly pullRequestNumber: number;
    readonly isPush: boolean;
    readonly pushIssueNumber: number;
}

export interface ResultPublicationRecord {
    readonly id: string;
    readonly executed: boolean;
    readonly steps: readonly string[];
    readonly reminders: readonly string[];
    readonly errors: readonly ApplicationErrorPresentation[];
    readonly stepFormat: 'plain' | 'markdown';
}

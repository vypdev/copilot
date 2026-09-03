import { Result } from '../../data/model/result';
import type { CopilotLifecycleLabels } from '../../domain/copilot_lifecycle';
export interface CopilotStatusExecutionContext {
    readonly owner: string;
    readonly repo: string;
    readonly eventName: string;
    readonly issueNumber: number;
    readonly isIssue: boolean;
    readonly isPush: boolean;
    readonly isPullRequest: boolean;
    readonly inputs?: {
        readonly action?: string;
    };
    readonly issue: {
        readonly number: number;
    };
    readonly pullRequest: {
        readonly number: number;
        readonly isPullRequestReviewComment: boolean;
    };
    readonly commit: {
        readonly branch: string;
    };
    readonly labels: {
        readonly currentIssueLabels?: readonly string[];
        readonly currentPullRequestLabels?: readonly string[];
        readonly lifecycle?: CopilotLifecycleLabels;
    };
    readonly currentConfiguration: {
        readonly results?: readonly {
            readonly payload: unknown;
        }[];
    };
    readonly ai: {
        readonly getAiPullRequestDescription: () => boolean;
        readonly getPullRequestDescriptionMode?: () => string;
    };
}
export interface CopilotStatusSnapshot {
    readonly owner: string;
    readonly repository: string;
    readonly event: string;
    readonly action: string;
    readonly target: 'issue' | 'pull-request' | 'push' | 'repository';
    readonly issueNumber?: number;
    readonly pullRequestNumber?: number;
    readonly branch?: string;
    readonly lifecycle?: string;
    readonly waitingFor?: string;
    readonly issueLabels: readonly string[];
    readonly pullRequestLabels: readonly string[];
    readonly activeFindings?: {
        open: number;
        reopened: number;
        resolved: number;
    };
    readonly pullRequestDescriptionMode: string;
}
/** Builds a read-only status snapshot from the facts already loaded by setup. */
export declare function buildCopilotStatusSnapshot(execution: CopilotStatusExecutionContext): CopilotStatusSnapshot;
export declare function buildCopilotStatusResult(execution: CopilotStatusExecutionContext, taskId: string): Result;
export declare function formatCopilotStatus(snapshot: CopilotStatusSnapshot): string;

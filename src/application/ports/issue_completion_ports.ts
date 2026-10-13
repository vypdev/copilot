import type { NativeIssueCompletionFacts } from '../../domain/issue_completion';

/** A physically frozen capability for one verified repository/issue. */
export interface IssueCompletionTargetPort {
    read(): Promise<NativeIssueCompletionFacts>;
    close(): Promise<boolean>;
    addLabel(label: string): Promise<void>;
    removeLabel(label: string): Promise<void>;
}

export interface BoundIssueCompletionPort {
    readPullRequest(number: number): Promise<NativePullRequestCompletionFacts>;
    forIssue(number: number): IssueCompletionTargetPort;
}

/** Status cannot obtain the target's write methods. */
export interface BoundIssueCompletionReadPort {
    readIssue(number: number): Promise<NativeIssueCompletionFacts>;
}

/** Closed-event repair cannot reopen/close issues, replace labels, or publish. */
export interface BoundIssueCompletionMetadataPort {
    forIssue(number: number): {
        read(): Promise<NativeIssueCompletionFacts>;
        addLabel(label: string): Promise<void>;
        removeLabel(label: string): Promise<void>;
    };
}

export interface NativePullRequestCompletionFacts {
    readonly number: number;
    readonly state: 'open' | 'closed';
    readonly merged: boolean;
}
export interface BoundNativeStatusReadPort extends BoundIssueCompletionReadPort {
    readPullRequest(number: number): Promise<NativePullRequestCompletionFacts>;
}

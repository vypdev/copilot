/**
 * Copilot labels are split into independent dimensions. A durable lifecycle
 * phase can coexist with temporary agent activity and a human waiting state.
 * This policy is independent from GitHub's API model and remains unit-testable
 * without I/O.
 */
export type CopilotLifecycleState = 'planned' | 'in-progress' | 'reviewing' | 'changes-requested' | 'verified' | 'ready' | 'blocked';
export type CopilotAgentActivity = 'ai-processing';
export type CopilotWaitingState = 'awaiting-maintainer' | 'awaiting-issue-author';
export interface CopilotLifecycleLabels {
    aiProcessing: string;
    planned: string;
    inProgress: string;
    reviewing: string;
    changesRequested: string;
    verified: string;
    ready: string;
    blocked: string;
    awaitingMaintainer: string;
    awaitingIssueAuthor: string;
}
export declare const DEFAULT_COPILOT_LIFECYCLE_LABELS: Readonly<CopilotLifecycleLabels>;
export type LifecycleLabelCategory = 'lifecycle' | 'activity' | 'waiting';
export interface LifecycleLabelDefinition {
    readonly category: LifecycleLabelCategory;
    readonly state?: CopilotLifecycleState;
    readonly name: string;
    readonly color: string;
    readonly description: string;
}
export declare function lifecycleLabelDefinitions(labels?: CopilotLifecycleLabels): LifecycleLabelDefinition[];
export declare function activityLabelDefinitions(labels?: CopilotLifecycleLabels): LifecycleLabelDefinition[];
export declare function waitingLabelDefinitions(labels?: CopilotLifecycleLabels): LifecycleLabelDefinition[];
export declare function managedLifecycleLabelDefinitions(labels?: CopilotLifecycleLabels): LifecycleLabelDefinition[];
export declare function lifecycleLabelNames(labels?: CopilotLifecycleLabels): string[];
export declare function activityLabelNames(labels?: CopilotLifecycleLabels): string[];
export declare function waitingLabelNames(labels?: CopilotLifecycleLabels): string[];
export declare function managedLifecycleLabelNames(labels?: CopilotLifecycleLabels): string[];
export declare function lifecycleStateLabel(state: CopilotLifecycleState, labels?: CopilotLifecycleLabels): string;
export declare function activityLabel(labels?: CopilotLifecycleLabels): string;
export declare function waitingStateLabel(state: CopilotWaitingState, labels?: CopilotLifecycleLabels): string;
export declare function lifecycleStateFromLabels(currentLabels: readonly string[], labels?: CopilotLifecycleLabels): CopilotLifecycleState | undefined;

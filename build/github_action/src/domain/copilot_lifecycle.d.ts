/**
 * The Copilot lifecycle is deliberately independent from GitHub's API model.
 * Labels are the persistence representation; this policy is the state machine
 * used by application workflows and can therefore be tested without I/O.
 */
export type CopilotLifecycleState = 'analyzing' | 'planned' | 'in-progress' | 'reviewing' | 'changes-requested' | 'verified' | 'ready' | 'blocked';
export interface CopilotLifecycleLabels {
    analyzing: string;
    planned: string;
    inProgress: string;
    reviewing: string;
    changesRequested: string;
    verified: string;
    ready: string;
    blocked: string;
}
export declare const DEFAULT_COPILOT_LIFECYCLE_LABELS: Readonly<CopilotLifecycleLabels>;
export interface LifecycleLabelDefinition {
    readonly state: CopilotLifecycleState;
    readonly name: string;
    readonly color: string;
    readonly description: string;
}
export declare function lifecycleLabelDefinitions(labels?: CopilotLifecycleLabels): LifecycleLabelDefinition[];
export declare function lifecycleLabelNames(labels?: CopilotLifecycleLabels): string[];
export declare function lifecycleStateLabel(state: CopilotLifecycleState, labels?: CopilotLifecycleLabels): string;
export declare function lifecycleStateFromLabels(currentLabels: readonly string[], labels?: CopilotLifecycleLabels): CopilotLifecycleState | undefined;

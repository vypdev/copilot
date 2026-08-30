/**
 * The Copilot lifecycle is deliberately independent from GitHub's API model.
 * Labels are the persistence representation; this policy is the state machine
 * used by application workflows and can therefore be tested without I/O.
 */
export type CopilotLifecycleState =
    | 'analyzing'
    | 'planned'
    | 'in-progress'
    | 'reviewing'
    | 'changes-requested'
    | 'verified'
    | 'ready'
    | 'blocked';

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

export const DEFAULT_COPILOT_LIFECYCLE_LABELS: Readonly<CopilotLifecycleLabels> = {
    analyzing: 'copilot:state:analyzing',
    planned: 'copilot:state:planned',
    inProgress: 'copilot:state:in-progress',
    reviewing: 'copilot:state:reviewing',
    changesRequested: 'copilot:state:changes-requested',
    verified: 'copilot:state:verified',
    ready: 'copilot:state:ready',
    blocked: 'copilot:state:blocked',
};

export interface LifecycleLabelDefinition {
    readonly state: CopilotLifecycleState;
    readonly name: string;
    readonly color: string;
    readonly description: string;
}

const LIFECYCLE_METADATA: ReadonlyArray<readonly [CopilotLifecycleState, keyof CopilotLifecycleLabels, string, string]> = [
    ['analyzing', 'analyzing', 'FBCA04', 'Copilot is analyzing the issue or change.'],
    ['planned', 'planned', '1D76DB', 'Copilot has produced an implementation plan.'],
    ['in-progress', 'inProgress', '0E8A16', 'Implementation work is in progress.'],
    ['reviewing', 'reviewing', '5319E7', 'A pull request is being reviewed.'],
    ['changes-requested', 'changesRequested', 'D93F0B', 'Review identified changes that are required.'],
    ['verified', 'verified', '0E8A16', 'The change has passed Copilot verification.'],
    ['ready', 'ready', '6F42C1', 'The change is ready for human approval or merge.'],
    ['blocked', 'blocked', 'B60205', 'The workflow is blocked and needs human input.'],
];

export function lifecycleLabelDefinitions(
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): LifecycleLabelDefinition[] {
    return LIFECYCLE_METADATA.map(([state, key, color, description]) => ({
        state,
        name: labels[key],
        color,
        description,
    }));
}

export function lifecycleLabelNames(
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): string[] {
    return lifecycleLabelDefinitions(labels).map(definition => definition.name);
}

export function lifecycleStateLabel(
    state: CopilotLifecycleState,
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): string {
    const definition = lifecycleLabelDefinitions(labels).find(candidate => candidate.state === state);
    if (!definition) throw new Error(`Unknown Copilot lifecycle state: ${state}`);
    return definition.name;
}

export function lifecycleStateFromLabels(
    currentLabels: readonly string[],
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): CopilotLifecycleState | undefined {
    const normalized = new Set(currentLabels.map(label => label.trim().toLowerCase()));
    return lifecycleLabelDefinitions(labels).find(definition => normalized.has(definition.name.trim().toLowerCase()))?.state;
}


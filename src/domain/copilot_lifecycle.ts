/**
 * Copilot labels are split into independent dimensions. A durable lifecycle
 * phase can coexist with temporary agent activity and a human waiting state.
 * This policy is independent from GitHub's API model and remains unit-testable
 * without I/O.
 */
export type CopilotLifecycleState =
    | 'planned'
    | 'in-progress'
    | 'reviewing'
    | 'changes-requested'
    | 'verified'
    | 'ready'
    | 'blocked';

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

export const DEFAULT_COPILOT_LIFECYCLE_LABELS: Readonly<CopilotLifecycleLabels> = {
    aiProcessing: 'state:ai-processing',
    planned: 'state:planned',
    inProgress: 'state:in-progress',
    reviewing: 'state:reviewing',
    changesRequested: 'state:changes-requested',
    verified: 'state:verified',
    ready: 'state:ready',
    blocked: 'state:blocked',
    awaitingMaintainer: 'state:awaiting-maintainer',
    awaitingIssueAuthor: 'state:awaiting-issue-author',
};

export type LifecycleLabelCategory = 'lifecycle' | 'activity' | 'waiting';

export interface LifecycleLabelDefinition {
    readonly category: LifecycleLabelCategory;
    readonly state?: CopilotLifecycleState;
    readonly name: string;
    readonly color: string;
    readonly description: string;
}

type StableMetadata = readonly [CopilotLifecycleState, keyof CopilotLifecycleLabels, string, string];
type ActivityMetadata = readonly [CopilotAgentActivity, keyof CopilotLifecycleLabels, string, string];
type WaitingMetadata = readonly [CopilotWaitingState, keyof CopilotLifecycleLabels, string, string];

const STABLE_LIFECYCLE_METADATA: ReadonlyArray<StableMetadata> = [
    ['planned', 'planned', '1D76DB', 'Copilot has produced an implementation plan.'],
    ['in-progress', 'inProgress', '0E8A16', 'Implementation work is in progress.'],
    ['reviewing', 'reviewing', '5319E7', 'A pull request is being reviewed.'],
    ['changes-requested', 'changesRequested', 'D93F0B', 'Review identified changes that are required.'],
    ['verified', 'verified', '0E8A16', 'The change has passed Copilot verification.'],
    ['ready', 'ready', '6F42C1', 'The change is ready for human approval or merge.'],
    ['blocked', 'blocked', 'B60205', 'The workflow is blocked and needs human input.'],
];

const ACTIVITY_METADATA: ReadonlyArray<ActivityMetadata> = [
    ['ai-processing', 'aiProcessing', 'FBCA04', 'A Copilot agent is analyzing or working on the issue or change.'],
];

const WAITING_METADATA: ReadonlyArray<WaitingMetadata> = [
    ['awaiting-maintainer', 'awaitingMaintainer', '5319E7', 'The next action requires a maintainer response or approval.'],
    ['awaiting-issue-author', 'awaitingIssueAuthor', 'D93F0B', 'The next action requires more information or changes from the issue author.'],
];

function stableDefinitions(labels: CopilotLifecycleLabels): LifecycleLabelDefinition[] {
    return STABLE_LIFECYCLE_METADATA.map(([state, key, color, description]) => ({
        category: 'lifecycle',
        state,
        name: labels[key],
        color,
        description,
    }));
}

function activityDefinitions(labels: CopilotLifecycleLabels): LifecycleLabelDefinition[] {
    return ACTIVITY_METADATA.map(([, key, color, description]) => ({
        category: 'activity',
        name: labels[key],
        color,
        description,
    }));
}

function waitingDefinitions(labels: CopilotLifecycleLabels): LifecycleLabelDefinition[] {
    return WAITING_METADATA.map(([, key, color, description]) => ({
        category: 'waiting',
        name: labels[key],
        color,
        description,
    }));
}

export function lifecycleLabelDefinitions(
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): LifecycleLabelDefinition[] {
    return stableDefinitions(labels);
}

export function activityLabelDefinitions(
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): LifecycleLabelDefinition[] {
    return activityDefinitions(labels);
}

export function waitingLabelDefinitions(
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): LifecycleLabelDefinition[] {
    return waitingDefinitions(labels);
}

export function managedLifecycleLabelDefinitions(
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): LifecycleLabelDefinition[] {
    return [
        ...stableDefinitions(labels),
        ...activityDefinitions(labels),
        ...waitingDefinitions(labels),
    ];
}

export function lifecycleLabelNames(
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): string[] {
    return lifecycleLabelDefinitions(labels).map(definition => definition.name);
}

export function activityLabelNames(
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): string[] {
    return activityLabelDefinitions(labels).map(definition => definition.name);
}

export function waitingLabelNames(
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): string[] {
    return waitingLabelDefinitions(labels).map(definition => definition.name);
}

export function managedLifecycleLabelNames(
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): string[] {
    return managedLifecycleLabelDefinitions(labels).map(definition => definition.name);
}

export function lifecycleStateLabel(
    state: CopilotLifecycleState,
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): string {
    const definition = lifecycleLabelDefinitions(labels).find(candidate => candidate.state === state);
    if (!definition) throw new Error(`Unknown Copilot lifecycle state: ${state}`);
    return definition.name;
}

export function activityLabel(
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): string {
    return labels.aiProcessing;
}

export function waitingStateLabel(
    state: CopilotWaitingState,
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): string {
    const metadata = WAITING_METADATA.find(([metadataState]) => metadataState === state);
    if (!metadata) throw new Error(`Unknown Copilot waiting state: ${state}`);
    return labels[metadata[1]];
}

export function lifecycleStateFromLabels(
    currentLabels: readonly string[],
    labels: CopilotLifecycleLabels = DEFAULT_COPILOT_LIFECYCLE_LABELS,
): CopilotLifecycleState | undefined {
    const normalized = new Set(currentLabels.map(label => label.trim().toLowerCase()));
    return lifecycleLabelDefinitions(labels).find(definition => normalized.has(definition.name.trim().toLowerCase()))?.state;
}

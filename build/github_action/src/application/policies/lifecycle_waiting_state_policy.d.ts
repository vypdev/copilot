import type { CopilotLifecycleState, CopilotWaitingState } from '../../domain/copilot_lifecycle';
export type LifecycleWaitingStateDecision = {
    kind: 'set';
    state: CopilotWaitingState;
} | {
    kind: 'clear';
} | {
    kind: 'preserve';
};
export interface LifecycleWaitingStateInput {
    readonly eventName: string;
    readonly lifecycleState: CopilotLifecycleState | undefined;
}
/**
 * Resolves who should provide the next human input. Waiting labels are
 * orthogonal to the stable lifecycle phase and at most one is retained.
 */
export declare function resolveLifecycleWaitingState(input: LifecycleWaitingStateInput): LifecycleWaitingStateDecision;

import type { CopilotLifecycleState, CopilotWaitingState } from '../../domain/copilot_lifecycle';

export type LifecycleWaitingStateDecision =
    | { kind: 'set'; state: CopilotWaitingState }
    | { kind: 'clear' }
    | { kind: 'preserve' };

export interface LifecycleWaitingStateInput {
    readonly eventName: string;
    readonly lifecycleState: CopilotLifecycleState | undefined;
}

/**
 * Resolves who should provide the next human input. Waiting labels are
 * orthogonal to the stable lifecycle phase and at most one is retained.
 */
export function resolveLifecycleWaitingState(
    input: LifecycleWaitingStateInput,
): LifecycleWaitingStateDecision {
    if (input.lifecycleState === 'planned'
        || input.lifecycleState === 'ready'
        || input.lifecycleState === 'blocked') {
        return { kind: 'set', state: 'awaiting-maintainer' };
    }
    if (input.lifecycleState === 'changes-requested') {
        return { kind: 'set', state: 'awaiting-issue-author' };
    }
    if (input.lifecycleState !== undefined || isHumanInteraction(input.eventName)) {
        return { kind: 'clear' };
    }
    return { kind: 'preserve' };
}

function isHumanInteraction(eventName: string): boolean {
    return [
        'issues',
        'issue_comment',
        'pull_request',
        'pull_request_review',
        'pull_request_review_comment',
        'check_suite',
        'workflow_run',
        'push',
    ].includes(eventName);
}

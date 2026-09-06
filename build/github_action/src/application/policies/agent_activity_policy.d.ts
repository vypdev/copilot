import type { AgentConfiguration, AgentTask } from '../../domain/agent';
export type AgentActivityRoute = 'single-action' | 'issue-comment' | 'issue' | 'pull-request-review-comment' | 'pull-request' | 'push';
export interface AgentActivityExecutionContext {
    readonly eventName: string;
    readonly issueNumber: number;
    readonly issue: {
        readonly number: number;
        readonly opened: boolean;
        readonly descriptionEdited: boolean;
        readonly commentBody: string;
    };
    readonly pullRequest: {
        readonly number: number;
        readonly action: string;
        readonly commentBody: string;
    };
    readonly commit: {
        readonly commits: readonly unknown[];
    };
    readonly singleAction: {
        readonly isThinkAction: boolean;
        readonly isRecommendStepsAction: boolean;
        readonly isCheckProgressAction: boolean;
        readonly isDetectPotentialProblemsAction: boolean;
    };
    readonly ai: {
        readonly getAiPullRequestDescription: () => boolean;
        readonly getAgentConfiguration: (task: AgentTask) => AgentConfiguration | undefined;
    };
}
/** Decides whether a route can invoke an agent for its current event. */
export declare function shouldTrackAgentActivity(execution: AgentActivityExecutionContext, route: AgentActivityRoute): boolean;

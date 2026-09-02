import type { Execution } from '../../data/model/execution';
export type AgentActivityRoute = 'single-action' | 'issue-comment' | 'issue' | 'pull-request-review-comment' | 'pull-request' | 'push';
/** Decides whether a route can invoke an agent for its current event. */
export declare function shouldTrackAgentActivity(execution: Execution, route: AgentActivityRoute): boolean;

import type { CommentAutomationContext } from './comment_automation_context';
import { readPullRequestStatusReadiness, type CopilotStatusReadPorts } from './read_pull_request_status_readiness_workflow';
export type { CopilotStatusReadPorts } from './read_pull_request_status_readiness_workflow';

/** Shared entrypoint: retain any independent SDD projection before delegating the resulting snapshot. */
export async function readCopilotStatus(param: CommentAutomationContext, taskId: string, ports?: CopilotStatusReadPorts) {
    return readPullRequestStatusReadiness(param, taskId, ports);
}

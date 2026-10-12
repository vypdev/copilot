import type { SddEvidenceQueryPort } from '../ports/sdd_evidence_read_ports';
import { projectSddStatus } from '../policies/sdd_status_policy';
import type { CommentAutomationContext } from './comment_automation_context';
import { readPullRequestStatusReadiness, type CopilotStatusReadPorts } from './read_pull_request_status_readiness_workflow';
export type { CopilotStatusReadPorts } from './read_pull_request_status_readiness_workflow';

/** Shared entrypoint: retain any independent SDD projection before delegating the resulting snapshot. */
export async function readCopilotStatus(param: CommentAutomationContext, taskId: string, ports?: CopilotStatusReadPorts, sddQuery?: SddEvidenceQueryPort) {
    let status = sddQuery ? Object.freeze({ ...param.status, serverOrigin: sddQuery.serverOrigin }) : param.status;
    if (status.target === 'issue' && param.sdd && status.issueNumber === param.sdd.issueNumber && sddQuery && status.sddReadiness) {
        const evidence = await sddQuery.read(param.sdd);
        status = Object.freeze({ ...status, sddReadiness: projectSddStatus(evidence, status.sddReadiness) });
    }
    return readPullRequestStatusReadiness({ ...param, status }, taskId, ports);
}

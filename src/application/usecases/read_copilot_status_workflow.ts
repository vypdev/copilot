import type { NativeIssueCompletionFacts } from '../../domain/issue_completion';
import type { NativePullRequestCompletionFacts } from '../ports/issue_completion_ports';
import type { SddEvidenceQueryPort } from '../ports/sdd_evidence_read_ports';
import { projectSddStatus } from '../policies/sdd_status_policy';
import type { CommentAutomationContext } from './comment_automation_context';
import type { BoundNativeStatusReadPort } from '../ports/issue_completion_ports';
import { buildCopilotStatusResult, projectCurrentNativeStatus } from '../policies/status_command_policy';
import { readPullRequestStatusReadiness, type CopilotStatusReadPorts } from './read_pull_request_status_readiness_workflow';
import { ApplicationError } from '../errors/application_error';
export type { CopilotStatusReadPorts } from './read_pull_request_status_readiness_workflow';

/** Shared read-only status path combines current native state with PR readiness evidence. */
export async function readCopilotStatus(param: CommentAutomationContext, taskId: string, ports?: CopilotStatusReadPorts, sddQuery?: SddEvidenceQueryPort, nativeStatus?: BoundNativeStatusReadPort) {
    let initialIssue: NativeIssueCompletionFacts | undefined;
    let initialPull: NativePullRequestCompletionFacts | undefined;
    let status = sddQuery ? Object.freeze({ ...param.status, serverOrigin: sddQuery.serverOrigin }) : param.status;
    if (nativeStatus && status.target === 'issue' && status.issueNumber) {
        const facts = await nativeStatus.readIssue(status.issueNumber);
        if (facts.number !== status.issueNumber) throw unavailableStatus();
        initialIssue = facts;
        status = projectCurrentNativeStatus(status, facts);
    } else if (nativeStatus && status.target === 'pull-request' && status.pullRequestNumber) {
        const facts = await nativeStatus.readPullRequest(status.pullRequestNumber);
        if (facts.number !== status.pullRequestNumber) throw unavailableStatus();
        initialPull = facts;
        status = projectCurrentNativeStatus(status, facts);
        if (facts.state === 'closed') {
            await fenceNativePull(nativeStatus, facts);
            return buildCopilotStatusResult({ ...status, findingStates: undefined, findingStateEvidence: undefined }, taskId);
        }
    }
    if (status.target === 'issue' && param.sdd && status.issueNumber === param.sdd.issueNumber && sddQuery && status.sddReadiness) {
        const evidence = await sddQuery.read(param.sdd);
        status = Object.freeze({ ...status, sddReadiness: projectSddStatus(evidence, status.sddReadiness) });
    }
    if (nativeStatus && initialIssue) {
        status = projectCurrentNativeStatus(status, await fenceNativeIssue(nativeStatus, initialIssue));
    }
    // Setup can attach a canonical PR to an issue conversation. Evaluate that exact PR
    // directly while retaining the issue's native lifecycle and SDD projection.
    const readinessStatus = status.target === 'issue' && status.pullRequestNumber
        ? { ...status, target: 'pull-request' as const }
        : status;
    const result = await readPullRequestStatusReadiness({ ...param, status: readinessStatus }, taskId, ports);
    const resultStatus = (result.payload as { status: import('../policies/status_command_policy').CopilotStatusSnapshot }).status;
    if (nativeStatus && initialPull) await fenceNativePull(nativeStatus, initialPull);
    if (nativeStatus && initialIssue) status = projectCurrentNativeStatus(status, await fenceNativeIssue(nativeStatus, initialIssue));
    if (nativeStatus && initialPull) status = projectCurrentNativeStatus(status, initialPull);
    return buildCopilotStatusResult({ ...resultStatus, target: status.target, lifecycle: status.lifecycle, waitingFor: status.waitingFor,
        issueLabels: status.issueLabels, pullRequestLabels: status.pullRequestLabels }, taskId);
}

function unavailableStatus(): ApplicationError {
    return new ApplicationError('workflow.stale', 'Current native status evidence is unavailable, incomplete or stale. Retry status.');
}

async function fenceNativePull(port: BoundNativeStatusReadPort, original: NativePullRequestCompletionFacts): Promise<void> {
    const fresh = await port.readPullRequest(original.number);
    if (fresh.number !== original.number || fresh.state !== original.state || fresh.merged !== original.merged) throw unavailableStatus();
}

async function fenceNativeIssue(port: BoundNativeStatusReadPort, original: NativeIssueCompletionFacts): Promise<NativeIssueCompletionFacts> {
    const fresh = await port.readIssue(original.number);
    if (fresh.number !== original.number || fresh.state !== original.state || fresh.reason !== original.reason
        || JSON.stringify([...fresh.labels].sort()) !== JSON.stringify([...original.labels].sort())) throw unavailableStatus();
    return fresh;
}

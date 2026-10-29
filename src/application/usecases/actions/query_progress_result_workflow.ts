import type { FindingsQueryPort, FindingsQueryRequest } from '../../ports/agent_findings_ports';
import type { AgentQueryResult } from '../../ports/agent_query_ports';
import { ApplicationError } from '../../errors/application_error';
import { progressResponseRejected } from '../../policies/progress_response_rejection_policy';
import { ProgressResponseContractFailure, isProgressSourceLineId, type ProgressResponsePhase } from '../../../domain/progress_response_diagnostic';

export interface ProgressResponseHostContext {
    readonly phase: ProgressResponsePhase;
    readonly requirementIds?: readonly string[];
    readonly sourceLineIds?: readonly string[];
    readonly anchors?: Readonly<Record<string, string>>;
}

/** Adds only current host-owned identities to typed completed-output failures. */
export async function queryProgressResult(agent: FindingsQueryPort, request: FindingsQueryRequest, host: ProgressResponseHostContext): Promise<AgentQueryResult> {
    try { return await agent.query(request); }
    catch (error) {
        if (!(error instanceof ProgressResponseContractFailure)) throw error;
        const facts = error.facts;
        if (facts.phase !== host.phase) throw new ApplicationError('agent.failed', 'Returned validation detail could not be bound to the current progress task. Existing progress was retained.');
        const requirementId = host.phase === 'assessment' && host.requirementIds?.includes(facts.requirementId) ? facts.requirementId : 'none';
        const candidateLine = host.phase === 'scope' ? facts.sourceLineId : host.anchors?.[requirementId];
        const sourceLineId = isProgressSourceLineId(candidateLine) && host.sourceLineIds?.includes(candidateLine) ? candidateLine : 'none';
        throw progressResponseRejected({ ...facts, requirementId, sourceLineId });
    }
}

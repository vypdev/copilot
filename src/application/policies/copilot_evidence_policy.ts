import { getResultPayload, type Result } from '../../data/model/result';
import type { CopilotEvidence } from '../ports/copilot_evidence_ports';

export interface CopilotEvidenceContext {
    readonly eventName: string;
    readonly headSha?: string;
    readonly summary: string;
    readonly results: readonly Result[];
}

/** Creates a stable native Check Run projection without performing GitHub I/O. */
export function buildCopilotEvidence(context: CopilotEvidenceContext): CopilotEvidence | undefined {
    const headSha = context.headSha?.trim();
    if (!headSha) return undefined;
    const failures = context.results.filter(result => !result.success && result.executed).length;
    const activeFindings = context.results
        .map(result => getFindingStateCounts(result.payload))
        .find(Boolean);
    const hasActionableFindings = (activeFindings?.open ?? 0) + (activeFindings?.reopened ?? 0) > 0;
    const conclusion = failures > 0 || hasActionableFindings
        ? 'failure'
        : context.results.length === 0
            ? 'neutral'
            : 'success';
    const name = context.eventName === 'pull_request'
        ? 'Copilot / Review'
        : ['issues', 'issue_comment', 'pull_request_review_comment'].includes(context.eventName)
            ? 'Copilot / Plan'
            : 'Copilot / Verification';
    return {
        name,
        headSha,
        conclusion,
        title: conclusion === 'failure'
            ? hasActionableFindings && failures === 0 ? 'Copilot found actionable findings' : 'Copilot found actionable failures'
            : 'Copilot completed successfully',
        summary: context.summary.slice(0, 20_000),
    };
}

function getFindingStateCounts(value: unknown): { open: number; reopened: number } | undefined {
    const payload = getResultPayload(value);
    const counts = getResultPayload(payload?.findingStates);
    if (!counts) return undefined;
    return typeof counts.open === 'number' && typeof counts.reopened === 'number'
        ? { open: counts.open, reopened: counts.reopened }
        : undefined;
}

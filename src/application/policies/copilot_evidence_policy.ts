import { getResultPayload, type Result } from '../../data/model/result';
import type { CopilotEvidence } from '../ports/copilot_evidence_ports';

export interface CopilotEvidenceContext {
    readonly eventName: string;
    readonly headSha?: string;
    readonly summary: string;
    readonly results: readonly Result[];
    readonly failOnUnresolvedFindings?: boolean;
}

/** Creates a stable native Check Run projection without performing GitHub I/O. */
export function buildCopilotEvidence(context: CopilotEvidenceContext): CopilotEvidence | undefined {
    const headSha = context.headSha?.trim();
    if (!headSha) return undefined;
    const failures = context.results.filter(result => !result.success && result.executed).length;
    const activeFindings = aggregateFindingStateCounts(context.results);
    const hasActionableFindings = (activeFindings?.open ?? 0)
        + (activeFindings?.reopened ?? 0)
        + (activeFindings?.verificationRequired ?? 0) > 0;
    const hasUnknownFindings = (activeFindings?.unknown ?? 0) > 0;
    const conclusion = failures > 0 || hasUnknownFindings || (hasActionableFindings && context.failOnUnresolvedFindings)
        ? 'failure'
        : context.results.length === 0 || hasActionableFindings
            ? 'neutral'
            : 'success';
    const name = context.eventName.startsWith('pull_request')
        ? 'Copilot / Review'
        : ['issues', 'issue_comment', 'pull_request_review_comment'].includes(context.eventName)
            ? 'Copilot / Plan'
            : 'Copilot / Verification';
    return {
        name,
        headSha,
        conclusion,
        title: hasActionableFindings && failures === 0
            ? 'Copilot found actionable findings'
            : conclusion === 'failure'
                ? 'Copilot found actionable failures'
                : conclusion === 'neutral'
                    ? 'Copilot review produced no actionable result'
                    : 'Copilot completed successfully',
        summary: context.summary.slice(0, 20_000),
    };
}

type EvidenceFindingCounts = { open: number; reopened: number; verificationRequired: number; unknown: number };

function aggregateFindingStateCounts(results: readonly Result[]): EvidenceFindingCounts | undefined {
    const counts = results.map(result => getFindingStateCounts(result.payload)).filter((value): value is EvidenceFindingCounts => value !== undefined);
    if (counts.length === 0) return undefined;
    return counts.reduce((total, current) => ({
        open: total.open + current.open,
        reopened: total.reopened + current.reopened,
        verificationRequired: total.verificationRequired + current.verificationRequired,
        unknown: total.unknown + current.unknown,
    }), { open: 0, reopened: 0, verificationRequired: 0, unknown: 0 });
}

function getFindingStateCounts(value: unknown): EvidenceFindingCounts | undefined {
    const payload = getResultPayload(value);
    const counts = getResultPayload(payload?.findingStates);
    if (!counts) return undefined;
    return typeof counts.open === 'number' && typeof counts.reopened === 'number'
        ? {
            open: counts.open,
            reopened: counts.reopened,
            verificationRequired: typeof counts['verification-required'] === 'number'
                ? counts['verification-required']
                : 0,
            unknown: typeof counts.unknown === 'number' ? counts.unknown : 0,
        }
        : undefined;
}

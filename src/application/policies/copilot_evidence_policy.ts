import { getResultPayload, type Result } from '../../data/model/result';
import type { CopilotEvidence } from '../ports/copilot_evidence_ports';
import { selectBugbotTelemetry, type BugbotTelemetryProjection } from './bugbot_telemetry_projection_policy';

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
    const isReviewEvent = context.eventName.startsWith('pull_request');
    const bugbotTelemetry = selectBugbotTelemetry(context.results);
    if (!isEligibleEvidenceSource(isReviewEvent, bugbotTelemetry, headSha)) return undefined;
    const failures = context.results.filter(result => !result.success && result.executed).length;
    const activeFindings = aggregateFindingStateCounts(context.results);
    const hasActionableFindings = (activeFindings?.open ?? 0)
        + (activeFindings?.reopened ?? 0)
        + (activeFindings?.verificationRequired ?? 0) > 0;
    const hasUnknownFindings = (activeFindings?.unknown ?? 0) > 0;
    const conclusion = resolveEvidenceConclusion({
        failureCount: failures,
        hasUnknownFindings,
        hasActionableFindings,
        failOnUnresolvedFindings: context.failOnUnresolvedFindings === true,
        hasResults: context.results.length > 0,
        bugbotTelemetry,
    });
    return {
        name: resolveEvidenceName(context.eventName, isReviewEvent),
        headSha,
        conclusion,
        title: resolveEvidenceTitle(conclusion, failures, hasActionableFindings, bugbotTelemetry),
        summary: context.summary.slice(0, 20_000),
    };
}

function isEligibleEvidenceSource(
    isReviewEvent: boolean,
    telemetry: BugbotTelemetryProjection | undefined,
    headSha: string,
): boolean {
    if (!isReviewEvent) return true;
    if (!telemetry?.headSha) return false;
    if (telemetry.outcome === 'dry-run') return false;
    return telemetry.headSha.toLowerCase() === headSha.toLowerCase();
}

interface EvidenceConclusionInput {
    readonly failureCount: number;
    readonly hasUnknownFindings: boolean;
    readonly hasActionableFindings: boolean;
    readonly failOnUnresolvedFindings: boolean;
    readonly hasResults: boolean;
    readonly bugbotTelemetry?: BugbotTelemetryProjection;
}

function resolveEvidenceConclusion(input: EvidenceConclusionInput): CopilotEvidence['conclusion'] {
    if (isFailedEvidence(input)) return 'failure';
    if (!input.hasResults) return 'neutral';
    if (input.hasActionableFindings) return 'neutral';
    if (incompleteReviewTitle(input.bugbotTelemetry)) return 'neutral';
    return 'success';
}

function isFailedEvidence(input: EvidenceConclusionInput): boolean {
    if (input.failureCount > 0) return true;
    if (input.hasUnknownFindings) return true;
    if (input.bugbotTelemetry?.outcome === 'failed') return true;
    return input.hasActionableFindings && input.failOnUnresolvedFindings;
}

function resolveEvidenceName(eventName: string, isReviewEvent: boolean): CopilotEvidence['name'] {
    if (isReviewEvent) return 'Copilot / Review';
    if (['issues', 'issue_comment', 'pull_request_review_comment'].includes(eventName)) return 'Copilot / Plan';
    return 'Copilot / Verification';
}

function resolveEvidenceTitle(
    conclusion: CopilotEvidence['conclusion'],
    failureCount: number,
    hasActionableFindings: boolean,
    telemetry: BugbotTelemetryProjection | undefined,
): string {
    if (hasActionableFindings && failureCount === 0) return 'Copilot found actionable findings';
    if (conclusion === 'failure') return 'Copilot found actionable failures';
    const incompleteTitle = incompleteReviewTitle(telemetry);
    if (incompleteTitle) return incompleteTitle;
    if (conclusion === 'neutral') return 'Copilot review produced no actionable result';
    return 'Copilot completed successfully';
}

function incompleteReviewTitle(telemetry: BugbotTelemetryProjection | undefined): string | undefined {
    switch (telemetry?.outcome) {
        case 'partial': return 'Copilot review has partial coverage';
        case 'superseded': return 'Copilot review was superseded';
        case 'skipped': return 'Copilot review was skipped';
        default: return undefined;
    }
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

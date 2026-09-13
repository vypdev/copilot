import type { Result } from '../../data/model/result';
import type { CopilotEvidence } from '../ports/copilot_evidence_ports';
import { projectBugbotResultTelemetry, type BugbotTelemetryProjection } from './bugbot_telemetry_projection_policy';
import { projectBugbotResultFindingStates } from './bugbot_result_finding_state_projection_policy';
import { countActionableBugbotFindings } from '../../domain/bugbot/review_state';

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
    const telemetryProjection = projectBugbotResultTelemetry(context.results);
    const bugbotTelemetry = telemetryProjection.status === 'valid' ? telemetryProjection.telemetry : undefined;
    if (!isEligibleEvidenceSource(isReviewEvent, bugbotTelemetry, headSha)) return undefined;
    const failures = context.results.filter(result => !result.success && result.executed).length;
    const findingStateProjection = projectBugbotResultFindingStates(context.results);
    const findingStates = findingStateProjection.status === 'valid' ? findingStateProjection.counts : undefined;
    const hasActionableFindings = findingStates ? countActionableBugbotFindings(findingStates) > 0 : false;
    const hasUnknownFindings = findingStateProjection.status === 'invalid' || (findingStates?.unknown ?? 0) > 0;
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

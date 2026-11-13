import { extractTitleFromBody } from '../../../../policies/bugbot_finding_marker_policy';
import { resolveBugbotShadowConfiguration } from '../../../../policies/bugbot_shadow_configuration_policy';
import type { AgentConfiguration } from '../../../../../domain/agent';
import { bugbotResolutionCandidateId, type BugbotFinding } from '../../../../../domain/bugbot/finding';
import { canonicalGitObjectId } from '../../../../../domain/git_object_id';
import type {
    BugbotShadowAnchor,
    BugbotShadowCandidate,
    BugbotShadowResult,
    BugbotShadowVerificationPort,
} from '../../../../ports/bugbot_shadow_verification_ports';
import { runWithConcurrencyLimit } from '../../../../policies/bounded_concurrency_policy';
import type { BugbotReviewOperationContext } from './bugbot_review_operation_context';
import type { BugbotContext } from './types';
import type { PreparedBugbotFindings } from './prepare_bugbot_findings';
import type { BugbotCandidateTrace } from './bugbot_candidate_trace';

type Observation = BugbotShadowResult & {
    readonly id: string;
    readonly candidate?: BugbotShadowCandidate;
    readonly wallMs: number;
    readonly ordinaryPublication: 'individual' | 'summary-only' | 'resolution';
};

export interface BugbotShadowVerificationReport {
    readonly resolvedModel: string;
    readonly provider: string;
    readonly candidates: readonly Observation[];
    readonly detectorModelProvider?: string;
    readonly detectorEffort?: string;
    readonly verifier?: { readonly model: string; readonly provider: string; readonly modelProvider?: string; readonly effort?: string };
    readonly experimentalProfileRejected?: true;
    readonly review?: {
        readonly repository: { readonly owner: string; readonly name: string };
        readonly pullRequest: number;
        readonly headSha: string;
        readonly baseSha?: string;
    };
    readonly detection?: ReturnType<BugbotCandidateTrace['detectionSnapshot']>;
    readonly origins?: ReturnType<BugbotCandidateTrace['snapshot']>;
    readonly timing?: {
        readonly detectionAndPreparationMs: number;
        readonly verificationWallMs: number;
        readonly workflowWallMs?: number;
        readonly concurrency: number;
    };
    readonly publicationSimulation?: { readonly status: 'invalid' } | {
        readonly status: 'complete' | 'incomplete';
        readonly individual: readonly string[];
        readonly overflow: number;
        readonly resolutions: readonly string[];
        readonly inconclusive: readonly { readonly id: string; readonly missing: string }[];
    };
    readonly detectionUnavailable?: true;
    readonly superseded?: true;
}

export async function observeBugbotShadowVerification(
    operation: BugbotReviewOperationContext,
    context: BugbotContext,
    prepared: PreparedBugbotFindings,
    port: BugbotShadowVerificationPort,
    trace: BugbotCandidateTrace,
    detectionAndPreparationMs: number,
    experimentalProfile?: Readonly<AgentConfiguration>,
): Promise<BugbotShadowVerificationReport> {
    const detector = operation.analysis.agentConfiguration;
    const dryRun = operation.analysis.reviewConfiguration.publicationMode === 'dry-run';
    const installed = operation.analysis.reviewConfiguration.shadowVerification;
    const configuration = dryRun && experimentalProfile ? experimentalProfile
        : installed ? resolveBugbotShadowConfiguration(detector, installed) : detector;
    const review = {};
    const started = performance.now();
    const findings = prepared.activeFindings ?? prepared.toPublish;
    const individual = new Set(prepared.toPublish.map(finding => finding.id));
    const historical = new Map(context.unresolvedFindingsWithBody.map(finding => [finding.id, finding]));
    const inputs = findings.map(finding => ({ id: finding.id, candidate: pinCandidate(operation, context, finding),
        ordinaryPublication: individual.has(finding.id) ? 'individual' as const : 'summary-only' as const }));
    const resolutions = [...prepared.resolvedFindingIds].map(id => {
        const prior = historical.get(id);
        const title = extractTitleFromBody(prior?.fullBody ?? null);
        const resolution = prepared.resolvedFindingResolutions?.get(id);
        const transition = resolution === 'obsolete' ? 'is obsolete because its path or precondition no longer applies'
            : 'is fixed because the current implementation prevents the original effect';
        const candidateId = bugbotResolutionCandidateId(id);
        return { id: candidateId, ordinaryPublication: 'resolution' as const,
            candidate: prior?.anchor && title ? pinCandidate(operation, context, {
                id: candidateId, file: prior.anchor.path, line: prior.anchor.line, title: `The historical finding “${title}” ${transition}.`,
                description: 'Compare with the prior behavior when the pinned base is relevant.',
            }, true) : undefined };
    });
    const concurrency = Math.min(2, inputs.length + resolutions.length);
    const tasks = [...inputs, ...resolutions].map(({ id, candidate, ordinaryPublication }) => async (): Promise<Observation> => {
        const started = performance.now();
        const observation = candidate
            ? await verifyCandidate(port, candidate, configuration, review)
            : { status: 'verdict' as const, verdict: 'inconclusive' as const, reason: 'Candidate could not be pinned.',
                missing: 'A repository location on the reviewed revision is required.', citations: [], premises: [] };
        return { ...observation, id, candidate, wallMs: Math.round(performance.now() - started), ordinaryPublication };
    });
    const candidates = await runWithConcurrencyLimit(tasks, 2);
    const pr = context.canonicalPullRequest;
    return {
        resolvedModel: detector.model, provider: detector.provider, detectorModelProvider: detector.modelProvider, detectorEffort: detector.effort,
        verifier: { model: configuration.model, provider: configuration.provider, modelProvider: configuration.modelProvider, effort: configuration.effort },
        ...(!dryRun && experimentalProfile ? { experimentalProfileRejected: true as const } : {}),
        ...(pr ? { review: { repository: { owner: pr.baseRepository.owner, name: pr.baseRepository.name },
            pullRequest: pr.number, headSha: pr.headSha, baseSha: pr.baseSha } } : {}),
        detection: trace.detectionSnapshot(),
        origins: trace.snapshot(),
        timing: { detectionAndPreparationMs, verificationWallMs: Math.round(performance.now() - started), concurrency },
        candidates,
    };
}

async function verifyCandidate(
    port: BugbotShadowVerificationPort,
    candidate: BugbotShadowCandidate,
    configuration: Readonly<AgentConfiguration>,
    review: object,
): Promise<BugbotShadowResult> {
    try {
        const result = await port.verify({ candidate, configuration, review });
        if (result.reportedModel && result.reportedModel !== configuration.model) {
            return { status: 'technical-failure', reason: 'reported-model-mismatch',
                reportedModel: result.reportedModel, investigation: result.investigation };
        }
        return result;
    } catch {
        return { status: 'technical-failure', reason: 'verifier-unavailable' };
    }
}

function pinCandidate(
    operation: BugbotReviewOperationContext, context: BugbotContext, finding: BugbotFinding, historicalResolution = false,
): BugbotShadowCandidate | undefined {
    const pr = context.canonicalPullRequest;
    const headSha = canonicalGitObjectId(pr ? context.prContext?.prHeadSha
        : operation.trigger.kind === 'push' ? operation.trigger.after : undefined);
    const hypothesis = finding.title.trim();
    const { file, line, endLine } = finding;
    if (!headSha || (pr && canonicalGitObjectId(pr.headSha) !== headSha) || !file || !line
        || !Number.isSafeInteger(line) || line < 1 || !hypothesis) return undefined;
    const locations = context.prContext?.pathToDiffLocations?.[file] ?? [];
    const sides = new Set(locations.filter(location => location.line === line).map(location => location.side));
    const side = sides.size === 1 ? sides.values().next().value : undefined;
    const anchor: BugbotShadowAnchor = Object.freeze({ path: file, line,
        end: endLine && Number.isSafeInteger(endLine) && endLine >= line ? endLine : line,
        ...(side ? { side } : {}) });
    // The published title is the claim. Description, confidence, detector evidence and proposed fixes stay out.
    const comparisonRelevant = historicalResolution || side === 'LEFT' || /\b(regressions?|regresi[oó]n|previously|used to|no longer|introduc\w*)\b/iu
        .test(hypothesis + '\n' + finding.description);
    const baseSha = canonicalGitObjectId(pr?.baseSha ?? operation.trigger.before);
    return Object.freeze({
        id: finding.id, hypothesis, anchor,
        repository: Object.freeze({ owner: pr?.baseRepository.owner ?? operation.repository.owner,
            name: pr?.baseRepository.name ?? operation.repository.name }),
        ...(pr ? { pullRequest: pr.number } : {}), headSha, allowBase: Boolean(baseSha && comparisonRelevant), ...(baseSha ? { baseSha } : {}),
    });
}

import { resolveBugbotShadowConfiguration } from '../../../../policies/bugbot_shadow_configuration_policy';
import type { AgentConfiguration } from '../../../../../domain/agent';
import type { BugbotFinding } from '../../../../../domain/bugbot/finding';
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
    readonly ordinaryPublication: 'individual' | 'summary-only';
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
    const concurrency = Math.min(2, findings.length);
    const tasks = findings.map(finding => async (): Promise<Observation> => {
        const candidate = pinCandidate(context, finding);
        const started = performance.now();
        const observation = candidate
            ? await verifyCandidate(port, candidate, configuration, review)
            : { status: 'technical-failure' as const, reason: 'unbound-candidate' };
        return {
            ...observation, id: finding.id, candidate,
            wallMs: Math.round(performance.now() - started),
            ordinaryPublication: individual.has(finding.id) ? 'individual' : 'summary-only',
        };
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

function pinCandidate(context: BugbotContext, finding: BugbotFinding): BugbotShadowCandidate | undefined {
    const pr = context.canonicalPullRequest;
    const headSha = canonicalGitObjectId(context.prContext?.prHeadSha);
    const hypothesis = finding.title.trim();
    const { file, line, endLine } = finding;
    if (!pr || !headSha || canonicalGitObjectId(pr.headSha) !== headSha || !file || !line
        || !Number.isSafeInteger(line) || line < 1 || !hypothesis) return undefined;
    const locations = context.prContext?.pathToDiffLocations?.[file] ?? [];
    const sides = new Set(locations.filter(location => location.line === line).map(location => location.side));
    const side = sides.size === 1 ? sides.values().next().value : undefined;
    const anchor: BugbotShadowAnchor = Object.freeze({ path: file, line,
        end: endLine && Number.isSafeInteger(endLine) && endLine >= line ? endLine : line,
        ...(side ? { side } : {}) });
    // The published title is the claim. Description, confidence, detector evidence and proposed fixes stay out.
    const comparisonRelevant = side === 'LEFT' || /\b(regressions?|regresi[oó]n|previously|used to|no longer|introduc\w*)\b/iu
        .test(hypothesis + '\n' + finding.description);
    const baseSha = canonicalGitObjectId(pr.baseSha);
    return Object.freeze({
        id: finding.id, hypothesis, anchor,
        repository: Object.freeze({ owner: pr.baseRepository.owner, name: pr.baseRepository.name }),
        pullRequest: pr.number, headSha, allowBase: Boolean(baseSha && comparisonRelevant), ...(baseSha ? { baseSha } : {}),
    });
}

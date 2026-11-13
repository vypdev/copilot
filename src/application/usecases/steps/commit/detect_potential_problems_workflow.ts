import type { BugbotVerificationAuthority, BugbotVerificationPublication } from '../../../../domain/bugbot/verification_receipt';
import { canonicalGitObjectId } from '../../../../domain/git_object_id';
import { projectVerifiedBugbotPublication, type BugbotVerificationProjection } from './bugbot/verify_bugbot_publication_policy';
import type { BoundPublicationSourceQueryPort } from '../../../ports/publication_freshness_ports';
import type { AgentConfiguration } from '../../../../domain/agent';
import { BugbotCandidateTrace } from './bugbot/bugbot_candidate_trace';
import type { BugbotShadowVerificationPort } from '../../../ports/bugbot_shadow_verification_ports';
import { observeBugbotShadowVerification, type BugbotShadowVerificationReport } from './bugbot/observe_bugbot_shadow_verification';
import { BugbotReviewCompletenessError } from '../../../../domain/bugbot/framed_review';
import { isAgentConfigurationReady } from '../../../../data/model/agent';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';
import type { BugbotScmPorts } from '../../../ports/bugbot_scm_ports';
import { PullRequestReviewOperationError } from '../../../ports/pull_request_review_errors';
import {
    loadBugbotContext,
    preflightBugbotContext,
} from './bugbot/load_bugbot_context_use_case';
import {
    projectBugbotContextRequest,
    type LoadBugbotContextOptions,
} from './bugbot/bugbot_context_request';
import { applyDetectedFindings } from './bugbot/apply_detected_findings';
import type { PreparedBugbotFindings } from './bugbot/prepare_bugbot_findings';
import { projectBugbotFindingStatuses } from '../../../policies/bugbot_finding_status_policy';
import type { BugbotContext } from './bugbot/types';
import type { BugbotReviewOutcome, BugbotTelemetryPort } from '../../../ports/bugbot_telemetry_ports';
import { BugbotReviewTelemetry } from './bugbot/bugbot_review_telemetry';
import { BugbotReviewProgress } from './bugbot/bugbot_review_progress';
import { analyzeBugbotRevision } from './bugbot/analyze_bugbot_revision_use_case';
import { hasNewerBugbotRevision, isLoadedBugbotRevisionSuperseded } from './bugbot/bugbot_review_freshness';
import {
    reconcileBugbotReviewState,
    type BugbotPresentationReport,
} from './bugbot/reconcile_bugbot_review_state_use_case';
import type { BugbotFinding } from '../../../../domain/bugbot/finding';
import { ApplicationError, toApplicationError } from '../../../errors/application_error';
import {
    type BugbotReviewOperationContext,
} from './bugbot/bugbot_review_operation_context';
import { selectPullRequestOwnerForPushReview } from '../../../policies/bugbot_event_ownership_policy';
import type { MessageCatalogResolutionPort } from '../../../ports/message_catalog_ports';
import {
    resolveBugbotCatalog,
    type BugbotMessageCatalog,
} from '../../../policies/bugbot_message_catalog';
import { formatBugbotPartitionCompletion } from '../../../policies/bugbot_partition_completion_policy';

export interface DetectPotentialProblemsWorkflowDependencies {
    aiRepository: FindingsQueryPort;
    scm: BugbotScmPorts;
    telemetryPort?: BugbotTelemetryPort;
    catalogResolver?: MessageCatalogResolutionPort;
    shadowVerification?: BugbotShadowVerificationPort;
    experimentalShadowProfile?: Readonly<AgentConfiguration>;
    /** Supplied only by trusted rollout admission, independently of agent or repository text. */
    verificationAuthority?: BugbotVerificationAuthority;
    sourceFreshness?: BoundPublicationSourceQueryPort;
}

const TASK_ID = 'DetectPotentialProblemsUseCase';

/** Coordinates Bugbot context, analysis and finding publication behind application ports. */
export async function runDetectPotentialProblemsWorkflow(
    reviewContext: BugbotReviewOperationContext,
    dependencies: DetectPotentialProblemsWorkflowDependencies,
): Promise<Result[]> {
    const workflowStartedAt = Date.now();
    const telemetry = new BugbotReviewTelemetry(reviewContext);
    const resolvedAgent = reviewContext.analysis.agentConfiguration;
    const trace = dependencies.shadowVerification ? new BugbotCandidateTrace() : undefined;
    let shadow: BugbotShadowVerificationReport | undefined;
    let verification: BugbotVerificationProjection | undefined;
    let progress: BugbotReviewProgress | undefined;
    const authority = dependencies.verificationAuthority;
    const enforced = authority?.mode === 'enforced';
    const requiresReceipt = authority !== undefined;
    const dryRun = reviewContext.analysis.reviewConfiguration.publicationMode === 'dry-run';
    const unavailableShadow = (): BugbotShadowVerificationReport | undefined => dependencies.shadowVerification
        ? { resolvedModel: resolvedAgent.model, provider: resolvedAgent.provider, candidates: [], detectionUnavailable: true,
            detection: trace?.detectionSnapshot(), origins: trace?.snapshot() }
        : undefined;
    const shadowPayload = () => shadow ? { bugbotShadowVerification: {
        ...shadow, ...(shadow.timing ? { timing: { ...shadow.timing, workflowWallMs: Date.now() - workflowStartedAt } } : {}),
        ...(verification ? { publicationSimulation: verification.status === 'invalid' ? { status: 'invalid' } : {
            status: verification.status, individual: verification.prepared.toPublish.map(finding => finding.id),
            overflow: verification.prepared.overflowCount, resolutions: [...verification.prepared.resolvedFindingIds],
            inconclusive: verification.inconclusive,
        } } : {}),
    } } : {};
    const publishTelemetry = async (outcome: BugbotReviewOutcome, category?: string) => {
        const snapshot = telemetry.snapshot(outcome, category);
        if (reviewContext.analysis.reviewConfiguration.telemetry) {
            try {
                await dependencies.telemetryPort?.publish(snapshot);
            } catch {
                logInfo('Bugbot telemetry publication failed without affecting the review.');
            }
        }
        return snapshot;
    };
    const complete = async (result: Result, outcome: BugbotReviewOutcome): Promise<Result[]> => {
        await progress?.record('finished', {}, outcome);
        const snapshot = await publishTelemetry(outcome);
        const payload = result.payload && typeof result.payload === 'object' && !Array.isArray(result.payload)
            ? result.payload as Record<string, unknown>
            : {};
        result.payload = { ...payload, ...shadowPayload(), bugbotTelemetry: snapshot, ...(dryRun ? { dryRun: true } : {}),
            ...(enforced && (outcome === 'failed' || outcome === 'superseded') ? { bugbotPublicationBlocked: true } : {}) };
        return [result];
    };
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    try {
        if (shouldSkipDetection(reviewContext)) {
            await publishTelemetry('skipped', 'admission');
            return [];
        }
        const contextOptions = resolveContextOptions(reviewContext);
        if (contextOptions === null) {
            logDebugInfo('No branch or pull request target available for potential-problems detection.');
            await publishTelemetry('skipped', 'missing_context');
            return [];
        }
        const contextRequest = projectBugbotContextRequest(reviewContext, contextOptions);
        const preflight = await telemetry.measure('context-preflight', () =>
            preflightBugbotContext(contextRequest, dependencies.scm.context));
        telemetry.observePreflight(preflight);
        const owningPullRequest = selectPullRequestOwnerForPushReview({
            triggerKind: reviewContext.trigger.kind,
            eventTargetsPullRequest: reviewContext.target.isPullRequest,
            selectionReason: preflight.selectionReason,
            canonicalPullRequest: preflight.canonicalPullRequest,
        });
        if (owningPullRequest) {
            logInfo(
                `Skipping push Bugbot analysis because pull request #${owningPullRequest.number} owns review for this head.`,
            );
            await publishTelemetry('skipped', 'pull_request_ownership');
            return [];
        }
        // Comment events omit draft state, and delayed PR events may carry an
        // obsolete value. The already verified provider identity is authoritative.
        if (preflight.canonicalPullRequest?.draft
            && !reviewContext.analysis.reviewConfiguration.reviewDrafts) {
            return await complete(skippedDraftResult(), 'skipped');
        }
        if (preflight.canonicalPullRequest) {
            progress = new BugbotReviewProgress(preflight.canonicalPullRequest, dependencies.scm.progress, dryRun, reviewContext.locale.pullRequest);
            await progress.record('preparing');
        }
        const context = await telemetry.measure('context', () =>
            loadBugbotContext(contextRequest, dependencies.scm.context, preflight, dependencies.scm.reviewSource));
        telemetry.observeContext(context);
        progress?.pinComparison(context.canonicalPullRequest?.baseRefSha);
        const eventHeadSha = reviewContext.trigger.expectedHeadSha;
        if (isLoadedBugbotRevisionSuperseded(context, eventHeadSha)) {
            return await complete(supersededResult(context.prContext?.prHeadSha, eventHeadSha), 'superseded');
        }
        const detectionStartedAt = Date.now();
        await progress?.record('analyzing');
        let prepared = await analyzeBugbotRevision(reviewContext, context, { agent: dependencies.aiRepository, telemetry, trace, progress,
            isSourceCurrent: async () => !await hasNewerBugbotRevision(context, dependencies.scm.context) });
        const detectionAndPreparationMs = Date.now() - detectionStartedAt;
        if (prepared === undefined) {
            shadow = unavailableShadow();
            if (enforced) return await complete(noAnalysisResult(), 'failed');
            const analysisError = new ApplicationError('agent.failed', 'The configured agent returned no potential-problem analysis.');
            const catalog = reviewContext.analysis.reviewConfiguration.publicationMode === 'publish'
                && context.prContext && context.canonicalPullRequest
                ? await resolvePublicationCatalog(reviewContext, dependencies, true)
                : undefined;
            const presentation = !dryRun
                ? await telemetry.measure('projection', () => reconcileReviewState({
                    operation: reviewContext,
                    loadedContext: context,
                    activeFindings: [],
                    mutationErrors: [analysisError],
                    dependencies,
                    catalog,
                }))
                : undefined;
            if (presentation) telemetry.observeProjection(presentation.projection);
            return await complete(noAnalysisResult(presentation), 'failed');
        }
        telemetry.observePrepared(prepared);
        if (await telemetry.measure('freshness', () =>
            hasNewerBugbotRevision(context, dependencies.scm.context))) {
            return await complete(supersededResult(context.prContext?.prHeadSha), 'superseded');
        }
        if (dependencies.shadowVerification && trace) {
            shadow = await observeBugbotShadowVerification(
                reviewContext, context, prepared, dependencies.shadowVerification, trace,
                detectionAndPreparationMs, dependencies.experimentalShadowProfile,
                enforced || dryRun ? progress : undefined,
            );
            if (shadow.candidates.length > 0 && await hasNewerBugbotRevision(context, dependencies.scm.context)) {
                shadow = { ...shadow, superseded: true };
                return await complete(supersededResult(context.prContext?.prHeadSha), 'superseded');
            }
        }
        if (shadow) verification = projectVerifiedBugbotPublication(prepared, shadow, reviewContext.analysis.commentLimit);
        if (dryRun) {
            return await complete(dryRunResult(prepared, context), 'dry-run');
        }
        if (enforced) {
            if (!verification || verification.status === 'invalid') {
                return await complete(new Result({
                    id: TASK_ID, success: false, executed: true,
                    errors: [new ApplicationError('validation.evidence-unavailable',
                        'Bugbot verification failed before publication. The previous verified result was preserved.')],
                }), 'failed');
            }
            prepared = verification.prepared;
        }
        const incompleteVerification = enforced && verification?.status === 'incomplete';
        const publicationContext = incompleteVerification
            ? { ...context, coverage: { ...context.coverage, status: 'partial' as const } }
            : context;
        // A pull request still publishes its canonical status card when there are no finding mutations.
        const presentsPullRequestStatus = Boolean(context.prContext && context.canonicalPullRequest);
        const mutatesFindingComments = prepared.toPublish.length > 0
            || prepared.resolvedFindingIds.size > 0;
        const catalog = presentsPullRequestStatus || mutatesFindingComments
            ? await resolvePublicationCatalog(reviewContext, dependencies, presentsPullRequestStatus)
            : undefined;
        await progress?.record('publishing');
        // Catalog localization and progress can await a provider. Recheck before mutating findings.
        if (enforced && !context.canonicalPullRequest) {
            const expected = canonicalGitObjectId(reviewContext.trigger.after);
            const branch = reviewContext.target.commitBranch;
            const current = expected && branch && dependencies.sourceFreshness
                ? canonicalGitObjectId(await dependencies.sourceFreshness.getBranchHeadSha(branch)) : undefined;
            if (!current) throw new ApplicationError('validation.evidence-unavailable', 'Bugbot could not bind the current Commit revision.');
            if (current !== expected) return await complete(supersededResult(expected), 'superseded');
        }
        if ((requiresReceipt || context.reviewFramedSource)
            && await hasNewerBugbotRevision(context, dependencies.scm.context, 'before-publication', requiresReceipt)) {
            return await complete(supersededResult(context.prContext?.prHeadSha), 'superseded');
        }
        const resolutionErrors = await telemetry.measure('publication', () => applyDetectedFindings(
            reviewContext,
            context,
            prepared,
            dependencies.scm.publication,
            dependencies.scm.resolution,
            catalog,
        ));
        if (await telemetry.measure('post-publication-freshness', () =>
            hasNewerBugbotRevision(context, dependencies.scm.context, 'after-publication', requiresReceipt))) {
            return await complete(supersededResult(context.prContext?.prHeadSha), 'superseded');
        }
        const presentation = await telemetry.measure('projection', () =>
            reconcileReviewState({
                operation: reviewContext,
                loadedContext: publicationContext,
                activeFindings: prepared.activeFindings ?? prepared.toPublish,
                expectedPublishedFindings: prepared.toPublish,
                mutationErrors: resolutionErrors,
                dependencies,
                catalog,
            }));
        if (presentation) telemetry.observeProjection(presentation.projection);
        logInfo(`Bugbot workflow completed in ${Date.now() - workflowStartedAt}ms.`);
        const finalErrors = presentation?.errors ?? resolutionErrors;
        const hasChanges = prepared.toPublish.length > 0 || prepared.resolvedFindingIds.size > 0;
        const result = detectionResult(prepared, publicationContext, finalErrors, presentation);
        if (incompleteVerification) result.steps.push('Repository verification remains inconclusive for one or more candidates.');
        const publication = authority && buildVerificationPublication(authority, reviewContext, context, verification, presentation, finalErrors);
        if (publication) result.payload = { ...result.payload as object, bugbotVerificationPublication: publication };
        return await complete(
            result,
            finalErrors.length > 0
                ? 'failed'
                : publicationContext.coverage.status === 'partial'
                    ? 'partial'
                    : hasChanges ? 'completed' : 'no-findings',
        );
    } catch (error) {
        const resultError = toApplicationError(
            error instanceof BugbotReviewCompletenessError
                ? new ApplicationError('validation.evidence-unavailable', 'Bugbot could not verify a complete source-bound review.', { retryable: false, recovery: { id: 'bugbot-review-incomplete', variables: error.facts } })
                : error,
            'provider.unavailable',
            `Error in ${TASK_ID}: Unable to detect potential problems.`,
        );
        logError(resultError);
        await progress?.record('finished', { failureCode: resultError.code }, 'failed');
        const result = new Result({
            id: TASK_ID,
            success: false,
            executed: true,
            errors: [resultError],
        });
        const snapshot = await publishTelemetry('failed', error instanceof Error ? error.name : 'unknown');
        shadow ??= unavailableShadow();
        result.payload = { ...shadowPayload(), bugbotTelemetry: snapshot, ...(dryRun ? { dryRun: true } : {}),
            ...(enforced ? { bugbotPublicationBlocked: true } : {}) };
        return [result];
    }
}

function skippedDraftResult(): Result {
    return new Result({
        id: TASK_ID,
        success: true,
        executed: false,
        steps: ['Draft pull request review skipped by configuration.'],
        payload: { skipped: 'draft' },
    });
}

function dryRunResult(prepared: PreparedBugbotFindings, context: BugbotContext): Result {
    const acceptedCount = prepared.activeFindings?.length ?? 0;
    const partitionCompletion = formatBugbotPartitionCompletion(context);
    const statuses = projectBugbotFindingStatuses(
        context.existingByFindingId,
        prepared.activeFindings ?? prepared.toPublish,
        prepared.resolvedFindingIds,
        prepared.resolvedFindingResolutions,
    );
    return new Result({
        id: TASK_ID,
        success: true,
        executed: true,
        steps: [`Bugbot dry-run completed${partitionCompletion.dryRunSuffix} with ${acceptedCount} accepted ${acceptedCount === 1 ? 'finding' : 'findings'}; no SCM mutations performed.`],
        payload: {
            dryRun: true,
            findings: prepared.activeFindings ?? prepared.toPublish,
            overflowCount: prepared.overflowCount,
            resolvedFindingIds: [...prepared.resolvedFindingIds],
            findingStates: statuses.counts,
            ruleSources: context.reviewRuleSources ?? [],
            contextCoverage: context.coverage,
        },
    });
}

function supersededResult(loadedHeadSha?: string, expectedHeadSha?: string): Result {
    logInfo('Bugbot analysis was superseded by a newer pull-request revision; publication skipped.');
    return new Result({
        id: TASK_ID,
        success: true,
        executed: true,
        steps: ['Potential problems detection superseded by a newer pull-request revision; no findings were published or resolved.'],
        payload: {
            superseded: true,
            ...(loadedHeadSha ? { analyzedHeadSha: loadedHeadSha } : {}),
            ...(expectedHeadSha ? { expectedHeadSha } : {}),
        },
    });
}

function resolveContextOptions(param: BugbotReviewOperationContext): LoadBugbotContextOptions | undefined | null {
    if (param.target.isPullRequest) {
        return {
            branchOverride: param.target.headBranch,
            issueNumberOverride: param.target.issueNumber,
            pullRequestNumberOverride: param.target.pullRequestNumber,
        };
    }
    if (param.target.commitBranch) return undefined;
    if (['issues', 'issue_comment'].includes(param.trigger.kind) && param.target.issueNumber > 0) {
        return undefined;
    }
    return null;
}

function shouldSkipDetection(param: BugbotReviewOperationContext): boolean {
    if (!isAgentConfigurationReady(param.analysis.agentConfiguration)) {
        logDebugInfo('Agent not configured; skipping potential problems detection.');
        return true;
    }
    if (param.target.issueNumber === -1
        && (!param.target.isPullRequest || param.target.pullRequestNumber <= 0)) {
        logDebugInfo('No issue or pull request number for this execution; skipping potential problems detection.');
        return true;
    }
    return false;
}

function noAnalysisResult(presentation?: BugbotPresentationReport): Result {
    logDebugInfo('DetectPotentialProblems: No response from configured agent.');
    const errors = presentation?.errors.length
        ? [...presentation.errors]
        : [new ApplicationError('agent.failed', 'The configured agent returned no potential-problem analysis.')];
    return new Result({
        id: TASK_ID,
        success: false,
        executed: true,
        ...(presentation ? {
            steps: [`Bugbot analysis failed; the verified PR status was reconciled (${formatStateCounts(presentation.projection.counts)}).`],
        } : {}),
        errors: errors.map(error => presentation
            ? toBugbotPresentationError(error)
            : toBugbotApplicationError(error, 'Bugbot review reconciliation failed.')),
        ...(presentation ? {
            payload: {
                findingStates: presentation.projection.counts,
                reviewProjection: presentation.projection,
                statusCardOperation: presentation.statusCardOperation,
                reviewUpdates: presentation.reviewUpdates,
                pendingReviewUpdates: presentation.pendingReviewUpdates,
            },
        } : {}),
    });
}

function detectionResult(
    prepared: PreparedBugbotFindings,
    context: BugbotContext,
    resolutionErrors: readonly Error[],
    presentation?: BugbotPresentationReport,
): Result {
    const hasFindingChanges = prepared.toPublish.length > 0 || prepared.resolvedFindingIds.size > 0;
    const stepParts = hasFindingChanges
        ? [`${prepared.toPublish.length} new/current ${prepared.toPublish.length === 1 ? 'finding' : 'findings'} from configured agent`]
        : ['no new findings, no resolved'];
    if (prepared.overflowCount > 0) stepParts.push(`${prepared.overflowCount} more not published (see summary comment)`);
    if (prepared.resolvedFindingIds.size > 0) stepParts.push(`${prepared.resolvedFindingIds.size} marked as resolved by configured agent`);
    if (context.coverage.status === 'partial') {
        stepParts.push('partial context coverage; this run does not declare the complete target clean');
    }
    const partitionCompletion = formatBugbotPartitionCompletion(context);
    if (partitionCompletion.resultStep) stepParts.push(partitionCompletion.resultStep);
    const statusSummary = presentation?.projection ?? projectBugbotFindingStatuses(
            context.existingByFindingId,
            prepared.activeFindings ?? prepared.toPublish,
            prepared.resolvedFindingIds,
            prepared.resolvedFindingResolutions,
        );
    stepParts.push(`states: ${formatStateCounts(statusSummary.counts)}`);
    if (presentation) {
        stepParts.push(`status card: ${presentation.statusCardOperation}`);
        stepParts.push(`review status blocks updated: ${presentation.reviewUpdates}`);
        if (presentation.pendingReviewUpdates > 0) {
            stepParts.push(`review status blocks pending: ${presentation.pendingReviewUpdates}`);
        }
    }
    return new Result({
        id: TASK_ID,
        success: resolutionErrors.length === 0,
        executed: true,
        steps: [`Potential problems detection completed. ${stepParts.join('; ')}.`],
        errors: resolutionErrors.map(error => presentation
            ? toBugbotPresentationError(error)
            : toBugbotApplicationError(
                error,
                'Bugbot finding publication or reconciliation failed.',
            )),
        payload: {
            findingStates: statusSummary.counts,
            contextCoverage: context.coverage,
            ...(presentation ? {
                reviewProjection: presentation.projection,
                statusCardOperation: presentation.statusCardOperation,
                reviewUpdates: presentation.reviewUpdates,
                pendingReviewUpdates: presentation.pendingReviewUpdates,
            } : {}),
        },
    });
}

function formatStateCounts(counts: Readonly<Record<string, number>>): string {
    return Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([state, count]) => `${state}=${count}`)
        .join(', ') || 'none';
}

function toBugbotApplicationError(error: unknown, fallbackMessage: string): ApplicationError {
    if (error instanceof ApplicationError) return error;
    const message = error instanceof PullRequestReviewOperationError ? error.message : fallbackMessage;
    return new ApplicationError('provider.unavailable', message, { cause: error });
}

function toBugbotPresentationError(error: Error): ApplicationError {
    if (error instanceof ApplicationError) return error;
    const message = error instanceof PullRequestReviewOperationError
        ? error.message
        : 'Bugbot finding presentation failed.';
    return new ApplicationError('provider.unavailable', message, { cause: error });
}

async function reconcileReviewState(input: {
    readonly operation: BugbotReviewOperationContext;
    readonly loadedContext: BugbotContext;
    readonly activeFindings: readonly BugbotFinding[];
    readonly expectedPublishedFindings?: readonly BugbotFinding[];
    readonly mutationErrors?: readonly Error[];
    readonly dependencies: DetectPotentialProblemsWorkflowDependencies;
    readonly catalog?: BugbotMessageCatalog;
}): Promise<BugbotPresentationReport | undefined> {
    const pullRequestNumber = input.loadedContext.canonicalPullRequest?.number;
    const analyzedHeadSha = input.loadedContext.prContext?.prHeadSha;
    if (!pullRequestNumber || !analyzedHeadSha) return undefined;
    return reconcileBugbotReviewState({
        target: {
            pullRequestNumber,
            ...(input.operation.target.issueNumber > 0
                ? { linkedIssueNumber: input.operation.target.issueNumber }
                : {}),
            analyzedHeadSha,
            ...(input.operation.trustedAuthorLogin
                ? { trustedAuthorLogin: input.operation.trustedAuthorLogin }
                : {}),
            locale: input.operation.locale.pullRequest,
        },
        loadedContext: input.loadedContext,
        activeFindings: input.activeFindings,
        ...(input.expectedPublishedFindings
            ? { expectedPublishedFindings: input.expectedPublishedFindings }
            : {}),
        ...(input.mutationErrors ? { mutationErrors: input.mutationErrors } : {}),
        snapshotPorts: input.dependencies.scm.reconciliation.snapshot,
        presentationPorts: input.dependencies.scm.reconciliation.presentation,
        catalog: input.catalog,
    });
}

function resolvePublicationCatalog(
    operation: BugbotReviewOperationContext,
    dependencies: DetectPotentialProblemsWorkflowDependencies,
    publishesToPullRequest: boolean,
): Promise<BugbotMessageCatalog> {
    const locale = publishesToPullRequest
        ? operation.locale.pullRequest
        : operation.locale.issue ?? operation.locale.pullRequest;
    return resolveBugbotCatalog(
        locale,
        operation.analysis.agentConfiguration,
        dependencies.catalogResolver,
    );
}

function buildVerificationPublication(
    authority: BugbotVerificationAuthority,
    operation: BugbotReviewOperationContext,
    context: BugbotContext,
    verification: BugbotVerificationProjection | undefined,
    presentation: BugbotPresentationReport | undefined,
    errors: readonly Error[],
): BugbotVerificationPublication | undefined {
    // Rollback attests the canonical ordinary review. Shadow observations do
    // not participate in approval evidence.
    if ((authority.mode === 'enforced' && verification?.status !== 'complete') || errors.length
        || presentation?.projection.outcome !== 'complete' || presentation.pendingReviewUpdates > 0
        || presentation.statusCardOperation === 'failed') return undefined;
    const pr = context.canonicalPullRequest;
    const headSha = canonicalGitObjectId(pr?.headSha);
    const baseSha = canonicalGitObjectId(pr?.baseSha);
    const repositoryId = pr?.baseRepository.id;
    const projection = presentation.projection;
    if (!pr || !headSha || !baseSha || !repositoryId || repositoryId !== operation.repository.id
        || projection.pullRequestNumber !== pr.number || projection.analyzedHeadSha !== headSha
        || projection.verifiedHeadSha !== headSha || projection.coverage.status !== 'complete') return undefined;
    const { open, reopened, dismissed, unknown, fixed, obsolete } = projection.counts;
    return {
        authority, repositoryId, pullNumber: pr.number, headSha, baseSha,
        coverage: 'complete', verification: 'complete', publication: 'verified', outcome: 'complete',
        findingStates: { open, reopened, dismissed, unknown, fixed, obsolete,
            verificationRequired: projection.counts['verification-required'] },
    };
}

import { isAgentConfigurationReady } from '../../../../data/model/agent';
import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';
import type { BugbotContextPorts } from '../../../ports/bugbot_context_ports';
import type { BugbotFindingPublicationPorts } from '../../../ports/bugbot_finding_publication_ports';
import type { BugbotFindingResolutionPorts } from '../../../ports/bugbot_finding_resolution_ports';
import { PullRequestReviewOperationError } from '../../../ports/pull_request_review_errors';
import { loadBugbotContext } from './bugbot/load_bugbot_context_use_case';
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
import { analyzeBugbotRevision } from './bugbot/analyze_bugbot_revision_use_case';
import { hasNewerBugbotRevision, isLoadedBugbotRevisionSuperseded } from './bugbot/bugbot_review_freshness';
import {
    reconcileBugbotReviewState,
    type BugbotPresentationReport,
} from './bugbot/reconcile_bugbot_review_state_use_case';
import type { BugbotFinding } from '../../../../domain/bugbot/finding';
import { ApplicationError } from '../../../errors/application_error';
import {
    projectBugbotReviewOperationContext,
    type BugbotReviewOperationContext,
} from './bugbot/bugbot_review_operation_context';

export interface DetectPotentialProblemsWorkflowDependencies {
    aiRepository: FindingsQueryPort;
    contextPorts: BugbotContextPorts;
    publicationPorts: BugbotFindingPublicationPorts;
    resolutionPorts: BugbotFindingResolutionPorts;
    telemetryPort?: BugbotTelemetryPort;
}

const TASK_ID = 'DetectPotentialProblemsUseCase';

/** Coordinates Bugbot context, analysis and finding publication behind application ports. */
export async function runDetectPotentialProblemsWorkflow(
    param: Execution,
    dependencies: DetectPotentialProblemsWorkflowDependencies,
): Promise<Result[]> {
    const workflowStartedAt = Date.now();
    const reviewContext = projectBugbotReviewOperationContext(param);
    const telemetry = new BugbotReviewTelemetry(reviewContext);
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
        const snapshot = await publishTelemetry(outcome);
        const payload = result.payload && typeof result.payload === 'object' && !Array.isArray(result.payload)
            ? result.payload as Record<string, unknown>
            : {};
        result.payload = { ...payload, bugbotTelemetry: snapshot };
        return [result];
    };
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    try {
        if (shouldSkipDetection(reviewContext)) {
            await publishTelemetry('skipped', 'admission');
            return [];
        }
        if (reviewContext.target.isPullRequest && reviewContext.target.draft
            && !reviewContext.analysis.reviewConfiguration.reviewDrafts) {
            return await complete(skippedDraftResult(), 'skipped');
        }

        const contextOptions = resolveContextOptions(reviewContext);
        if (contextOptions === null) {
            logDebugInfo('No branch or pull request target available for potential-problems detection.');
            await publishTelemetry('skipped', 'missing_context');
            return [];
        }
        const contextRequest = projectBugbotContextRequest(reviewContext, contextOptions);
        const contextReader = dependencies.contextPorts.loader.bind({
            owner: param.owner,
            repository: param.repo,
            token: param.tokens.token,
        });
        const context = await telemetry.measure('context', () => loadBugbotContext(contextRequest, contextReader));
        const eventHeadSha = reviewContext.trigger.expectedHeadSha;
        if (isLoadedBugbotRevisionSuperseded(context, eventHeadSha)) {
            return await complete(supersededResult(context.prContext?.prHeadSha, eventHeadSha), 'superseded');
        }
        const prepared = await analyzeBugbotRevision(reviewContext, context, { agent: dependencies.aiRepository, telemetry });
        if (prepared === undefined) {
            const analysisError = new ApplicationError('agent.failed', 'The configured agent returned no potential-problem analysis.');
            const presentation = reviewContext.analysis.reviewConfiguration.publicationMode === 'publish'
                ? await telemetry.measure('projection', () => reconcileReviewState({
                    execution: param,
                    loadedContext: context,
                    activeFindings: [],
                    mutationErrors: [analysisError],
                    dependencies,
                }))
                : undefined;
            if (presentation) telemetry.observeProjection(presentation.projection);
            return await complete(noAnalysisResult(presentation), 'failed');
        }
        telemetry.observePrepared(prepared);
        if (await telemetry.measure('freshness', () => hasNewerBugbotRevision(param, context, dependencies.contextPorts))) {
            return await complete(supersededResult(context.prContext?.prHeadSha), 'superseded');
        }
        if (reviewContext.analysis.reviewConfiguration.publicationMode === 'dry-run') {
            return await complete(dryRunResult(prepared, context), 'dry-run');
        }
        const resolutionErrors = await telemetry.measure('publication', () => applyDetectedFindings(
            param,
            context,
            prepared,
            dependencies.publicationPorts,
            dependencies.resolutionPorts,
        ));
        if (await telemetry.measure('post-publication-freshness', () =>
            hasNewerBugbotRevision(param, context, dependencies.contextPorts))) {
            return await complete(supersededResult(context.prContext?.prHeadSha), 'superseded');
        }
        const presentation = await telemetry.measure('projection', () =>
            reconcileReviewState({
                execution: param,
                loadedContext: context,
                activeFindings: prepared.activeFindings ?? prepared.toPublish,
                expectedPublishedFindings: prepared.toPublish,
                mutationErrors: resolutionErrors,
                dependencies,
            }));
        if (presentation) telemetry.observeProjection(presentation.projection);
        logInfo(`Bugbot workflow completed in ${Date.now() - workflowStartedAt}ms.`);
        const finalErrors = presentation?.errors ?? resolutionErrors;
        const hasChanges = prepared.toPublish.length > 0 || prepared.resolvedFindingIds.size > 0;
        return await complete(
            detectionResult(prepared, context, finalErrors, presentation),
            finalErrors.length > 0
                ? 'failed'
                : context.coverage.status === 'partial'
                    ? 'partial'
                    : hasChanges ? 'completed' : 'no-findings',
        );
    } catch (error) {
        const resultError = toBugbotApplicationError(
            error,
            `Error in ${TASK_ID}: Unable to detect potential problems.`,
        );
        logError(resultError.message);
        const result = new Result({
            id: TASK_ID,
            success: false,
            executed: true,
            errors: [resultError],
        });
        const snapshot = await publishTelemetry('failed', error instanceof Error ? error.name : 'unknown');
        result.payload = { bugbotTelemetry: snapshot };
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
        steps: [`Bugbot dry-run completed with ${prepared.activeFindings?.length ?? 0} accepted finding(s); no SCM mutations performed.`],
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
            findingStates: {},
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
        ? [`${prepared.toPublish.length} new/current finding(s) from configured agent`]
        : ['no new findings, no resolved'];
    if (prepared.overflowCount > 0) stepParts.push(`${prepared.overflowCount} more not published (see summary comment)`);
    if (prepared.resolvedFindingIds.size > 0) stepParts.push(`${prepared.resolvedFindingIds.size} marked as resolved by configured agent`);
    if (context.coverage.status === 'partial') {
        stepParts.push('partial context coverage; this run does not declare the complete target clean');
    }
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
    readonly execution: Execution;
    readonly loadedContext: BugbotContext;
    readonly activeFindings: readonly BugbotFinding[];
    readonly expectedPublishedFindings?: readonly BugbotFinding[];
    readonly mutationErrors?: readonly Error[];
    readonly dependencies: DetectPotentialProblemsWorkflowDependencies;
}): Promise<BugbotPresentationReport | undefined> {
    const pullRequestNumber = input.loadedContext.canonicalPullRequest?.number;
    const analyzedHeadSha = input.loadedContext.prContext?.prHeadSha;
    if (!pullRequestNumber || !analyzedHeadSha) return undefined;
    return reconcileBugbotReviewState({
        target: {
            owner: input.execution.owner,
            repository: input.execution.repo,
            pullRequestNumber,
            ...(input.execution.issueNumber > 0
                ? { linkedIssueNumber: input.execution.issueNumber }
                : {}),
            analyzedHeadSha,
            ...(input.execution.tokenUser
                ? { trustedAuthorLogin: input.execution.tokenUser }
                : {}),
            locale: input.execution.locale?.pullRequest ?? 'en-US',
        },
        credential: { token: input.execution.tokens.token },
        loadedContext: input.loadedContext,
        activeFindings: input.activeFindings,
        ...(input.expectedPublishedFindings
            ? { expectedPublishedFindings: input.expectedPublishedFindings }
            : {}),
        ...(input.mutationErrors ? { mutationErrors: input.mutationErrors } : {}),
        snapshotPorts: {
            issueComments: input.dependencies.contextPorts.issue,
            pullRequest: input.dependencies.contextPorts.pullRequest,
            reviews: input.dependencies.contextPorts.reviewState,
            navigation: input.dependencies.contextPorts.navigation,
        },
        presentationPorts: {
            comments: input.dependencies.publicationPorts.issueComments,
            reviews: input.dependencies.publicationPorts.reviewState,
        },
    });
}

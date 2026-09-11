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
import { loadBugbotContext, type LoadBugbotContextOptions } from './bugbot/load_bugbot_context_use_case';
import { applyDetectedFindings } from './bugbot/apply_detected_findings';
import type { PreparedBugbotFindings } from './bugbot/prepare_bugbot_findings';
import { projectBugbotFindingStatuses } from '../../../policies/bugbot_finding_status_policy';
import type { BugbotContext } from './bugbot/types';
import type { BugbotReviewOutcome, BugbotTelemetryPort } from '../../../ports/bugbot_telemetry_ports';
import { BugbotReviewTelemetry } from './bugbot/bugbot_review_telemetry';
import { analyzeBugbotRevision } from './bugbot/analyze_bugbot_revision_use_case';
import { expectedBugbotHeadSha, hasNewerBugbotRevision, isLoadedBugbotRevisionSuperseded } from './bugbot/bugbot_review_freshness';
import {
    reconcileBugbotReviewState,
    type BugbotPresentationReport,
} from './bugbot/reconcile_bugbot_review_state_use_case';

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
    const telemetry = new BugbotReviewTelemetry(param);
    const publishTelemetry = async (outcome: BugbotReviewOutcome, category?: string) => {
        const snapshot = telemetry.snapshot(outcome, category);
        if (param.ai.getBugbotReviewConfiguration().telemetry) {
            try {
                await dependencies.telemetryPort?.publish(snapshot);
            } catch (error) {
                logInfo(`Bugbot telemetry publication failed without affecting the review: ${error instanceof Error ? error.name : 'unknown'}.`);
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
        if (shouldSkipDetection(param)) {
            await publishTelemetry('skipped', 'admission');
            return [];
        }
        if (param.isPullRequest && param.inputs?.pull_request?.draft === true
            && !param.ai.getBugbotReviewConfiguration().reviewDrafts) {
            return await complete(skippedDraftResult(), 'skipped');
        }

        const contextOptions = await resolveContextOptions(param, dependencies.contextPorts);
        if (contextOptions === null) {
            logDebugInfo('No branch or pull request target available for potential-problems detection.');
            await publishTelemetry('skipped', 'missing_context');
            return [];
        }
        const context = await telemetry.measure('context', () => loadBugbotContext(param, contextOptions, dependencies.contextPorts));
        const eventHeadSha = expectedBugbotHeadSha(param);
        if (isLoadedBugbotRevisionSuperseded(context, eventHeadSha)) {
            return await complete(supersededResult(context.prContext?.prHeadSha, eventHeadSha), 'superseded');
        }
        const prepared = await analyzeBugbotRevision(param, context, { agent: dependencies.aiRepository, telemetry });
        if (prepared === undefined) {
            const analysisError = new Error('The configured agent returned no potential-problem analysis.');
            const presentation = param.ai.getBugbotReviewConfiguration().publicationMode === 'publish'
                ? await telemetry.measure('projection', () => reconcileBugbotReviewState({
                    execution: param,
                    loadedContext: context,
                    activeFindings: [],
                    mutationErrors: [analysisError],
                    contextPorts: dependencies.contextPorts,
                    publicationPorts: dependencies.publicationPorts,
                }))
                : undefined;
            if (presentation) telemetry.observeProjection(presentation.projection);
            return await complete(noAnalysisResult(presentation), 'failed');
        }
        telemetry.observePrepared(prepared);
        if (await telemetry.measure('freshness', () => hasNewerBugbotRevision(param, context, dependencies.contextPorts))) {
            return await complete(supersededResult(context.prContext?.prHeadSha), 'superseded');
        }
        if (param.ai.getBugbotReviewConfiguration().publicationMode === 'dry-run') {
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
            reconcileBugbotReviewState({
                execution: param,
                loadedContext: context,
                activeFindings: prepared.activeFindings ?? prepared.toPublish,
                expectedPublishedFindings: prepared.toPublish,
                mutationErrors: resolutionErrors,
                contextPorts: dependencies.contextPorts,
                publicationPorts: dependencies.publicationPorts,
            }));
        if (presentation) telemetry.observeProjection(presentation.projection);
        logInfo(`Bugbot workflow completed in ${Date.now() - workflowStartedAt}ms.`);
        const finalErrors = presentation?.errors ?? resolutionErrors;
        const hasChanges = prepared.toPublish.length > 0 || prepared.resolvedFindingIds.size > 0;
        return await complete(
            detectionResult(prepared, context, finalErrors, presentation),
            finalErrors.length === 0 ? (hasChanges ? 'completed' : 'no-findings') : 'failed',
        );
    } catch (error) {
        const normalizedError = error instanceof PullRequestReviewOperationError
            ? error
            : new Error('Unable to detect potential problems.');
        const resultError = new Error(`Error in ${TASK_ID}: ${normalizedError.message}`);
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

async function resolveContextOptions(
    param: Execution,
    contextPorts: BugbotContextPorts,
): Promise<LoadBugbotContextOptions | undefined | null> {
    if (param.isPullRequest) {
        return {
            branchOverride: param.pullRequest.head,
            issueNumberOverride: param.issueNumber,
            pullRequestNumberOverride: param.pullRequest.number,
        };
    }
    if (param.commit.branch?.trim()) return undefined;
    if (!['issues', 'issue_comment'].includes(param.eventName) || param.issueNumber <= 0) return undefined;
    const branch = await contextPorts.pullRequest.getHeadBranchForIssue(
        param.owner,
        param.repo,
        param.issueNumber,
        param.tokens.token,
    );
    return branch ? { branchOverride: branch } : null;
}

function shouldSkipDetection(param: Execution): boolean {
    if (!isAgentConfigurationReady(param.ai.getAgentConfiguration(param.isPullRequest ? 'reviewer' : 'findings'))) {
        logDebugInfo('Agent not configured; skipping potential problems detection.');
        return true;
    }
    if (param.issueNumber === -1 && (!param.isPullRequest || param.pullRequest.number <= 0)) {
        logDebugInfo('No issue or pull request number for this execution; skipping potential problems detection.');
        return true;
    }
    return false;
}

function noAnalysisResult(presentation?: BugbotPresentationReport): Result {
    logDebugInfo('DetectPotentialProblems: No response from configured agent.');
    const errors = presentation?.errors.length
        ? [...presentation.errors]
        : [new Error('The configured agent returned no potential-problem analysis.')];
    return new Result({
        id: TASK_ID,
        success: false,
        executed: true,
        ...(presentation ? {
            steps: [`Bugbot analysis failed; the verified PR status was reconciled (${formatStateCounts(presentation.projection.counts)}).`],
        } : {}),
        errors,
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
        errors: [...resolutionErrors],
        payload: {
            findingStates: statusSummary.counts,
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

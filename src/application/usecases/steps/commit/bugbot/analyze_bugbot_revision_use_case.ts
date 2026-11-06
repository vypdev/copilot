import { bugbotFramedSourceMatchesPullRequest } from '../../../../policies/bugbot_framed_identity_policy';
import { randomBytes } from 'node:crypto';
import { buildBugbotFramedReviewPlan } from '../../../../policies/bugbot_framed_review_policy';
import { BugbotReviewCompletenessError } from '../../../../../domain/bugbot/framed_review';
import { analyzeBugbotFrames, bugbotFramedContextDigest } from './analyze_bugbot_frames';
import type { FindingsQueryPort } from '../../../../ports/agent_findings_ports';
import { reconcileResolvedFindingIds } from '../../../../policies/bugbot_reconciliation_policy';
import { logInfo } from '../../../../ports/logging_ports';
import { applyCommentLimit } from './limit_comments';
import type { BugbotContext } from './types';
import { findExistingFindingInfo, retainExistingFindingIds } from '../../../../../domain/bugbot/finding';
import { buildBugbotReviewInput } from './build_bugbot_prompt';
import { prepareBugbotFindings } from './prepare_bugbot_findings';
import type { PreparedBugbotFindings } from './prepare_bugbot_findings';
import { queryBugbotFindings, queryBugbotPartitionFindings } from './query_bugbot_findings';
import type { BugbotReviewTelemetry } from './bugbot_review_telemetry';
import { filterEligibleBugbotResolutionIds, hasProtectedBugbotDismissal } from '../../../../policies/bugbot_resolution_eligibility_policy';
import type { BugbotReviewOperationContext } from './bugbot_review_operation_context';
import { runWithConcurrencyLimit } from '../../../../policies/bounded_concurrency_policy';
import {
    aggregateBugbotPartitionResponses,
    MAX_AGGREGATE_PARTITION_FINDINGS,
} from './bugbot_partition_aggregation';
import { ApplicationError } from '../../../../errors/application_error';

export interface AnalyzeBugbotRevisionDependencies {
    readonly isSourceCurrent?: () => Promise<boolean>;
    readonly agent: FindingsQueryPort;
    readonly telemetry: BugbotReviewTelemetry;
}

/** Pure analysis phase: query, validate, normalize, deduplicate and reconcile; never mutates the SCM. */
export async function analyzeBugbotRevision(
    execution: BugbotReviewOperationContext,
    context: BugbotContext,
    dependencies: AnalyzeBugbotRevisionDependencies,
): Promise<PreparedBugbotFindings | undefined> {
    dependencies.telemetry.observeContext(context);
    logInfo('Detecting potential problems via configured agent using canonical change context...');
    const startedAt = Date.now();
    const targetLocale = context.prContext && context.canonicalPullRequest
        ? execution.locale.pullRequest
        : execution.locale.issue ?? execution.locale.pullRequest;
    if (context.reviewFramedSource) {
        if (!context.canonicalPullRequest || !context.prContext || !bugbotFramedSourceMatchesPullRequest(context.reviewFramedSource, context.canonicalPullRequest)) throw new BugbotReviewCompletenessError('identity');
        context.reviewFramedPlan = buildBugbotFramedReviewPlan(context.reviewFramedSource, bugbotFramedContextDigest(execution, context), randomBytes(16).toString('hex'), execution.ignorePatterns);
        context.reviewDiffPartitions = context.reviewFramedPlan.partitions;
        context.reviewDiffFragmentCount = context.reviewFramedPlan.fragments.length;
        context.reviewDiffFileCount = context.reviewFramedPlan.retained;
    }
    const partitions = context.reviewDiffPartitions ?? [];
    const ignoredFileCount = context.reviewDiffIgnoredFileCount ?? 0;
    const canonicalZeroWork = Boolean(
        context.canonicalPullRequest
        && context.reviewDiffPartitions !== undefined
        && partitions.length === 0,
    );
    if (context.reviewFramedSource && !dependencies.isSourceCurrent) throw new BugbotReviewCompletenessError('capability');
    const agentResponse = context.reviewFramedPlan && partitions.length > 0
        ? await dependencies.telemetry.measure('analysis', () => analyzeBugbotFrames(execution, context, context.reviewFramedPlan!, { ...dependencies, isSourceCurrent: dependencies.isSourceCurrent! }))
        : canonicalZeroWork
        ? await dependencies.telemetry.measure('analysis', () => {
            dependencies.telemetry.observePartitionPlan(0, 0, 0);
            const reason = ignoredFileCount > 0
                ? `skipped ${ignoredFileCount} intentionally ignored changed ${ignoredFileCount === 1 ? 'file' : 'files'}`
                : 'received a canonical diff plan with no reviewable changed files';
            logInfo(`Bugbot reviewer ${reason} without resolving prior findings.`);
            return { outputLocale: targetLocale, findings: [], resolved_findings: [] };
        })
        : partitions.length > 0
        ? await dependencies.telemetry.measure('analysis', async () => {
            dependencies.telemetry.observePartitionPlan(
                partitions.length,
                context.reviewDiffFragmentCount ?? partitions.reduce((sum, partition) => sum + partition.fragmentCount, 0),
                context.reviewDiffFileCount ?? new Set(partitions.flatMap((partition) => partition.files)).size,
            );
            logInfo(`Bugbot reviewer planned ${partitions.length} bounded diff ${partitions.length === 1 ? 'partition' : 'partitions'} with maximum concurrency 2.`);
            const responses = await runWithConcurrencyLimit(
                partitions.map((partition) => async () => {
                    const { prompt, requiresCandidateVerification } = buildBugbotReviewInput(execution, context, { partition });
                    dependencies.telemetry.observePrompt(prompt);
                    dependencies.telemetry.beginPartition();
                    try {
                        const response = await queryBugbotPartitionFindings(
                            dependencies.agent,
                            execution.analysis.agentConfiguration,
                            prompt,
                            targetLocale,
                            { partitionId: partition.id, headSha: partition.headSha },
                            { enabled: requiresCandidateVerification, observePrompt: value => dependencies.telemetry.observePrompt(value), observeResponse: value => dependencies.telemetry.observeResponse(value) },
                        );
                        dependencies.telemetry.endPartition(true);
                        logInfo(`Bugbot reviewer completed partition ${partition.ordinal}/${partition.total}.`);
                        return response;
                    } catch (error) {
                        dependencies.telemetry.endPartition(false, {
                            ordinal: partition.ordinal,
                            category: partitionFailureCategory(error),
                        });
                        throw error;
                    }
                }),
                2,
            );
            return aggregateBugbotPartitionResponses(partitions, responses);
        })
        : await dependencies.telemetry.measure('analysis', async () => {
            const { prompt, requiresCandidateVerification } = buildBugbotReviewInput(execution, context);
            dependencies.telemetry.observePrompt(prompt);
            const response = await queryBugbotFindings(
                dependencies.agent,
                execution.analysis.agentConfiguration,
                prompt,
                targetLocale,
                { enabled: requiresCandidateVerification, observePrompt: value => dependencies.telemetry.observePrompt(value), observeResponse: value => dependencies.telemetry.observeResponse(value) },
            );
            return response;
        });
    logInfo(`Bugbot reviewer completed in ${Date.now() - startedAt}ms.`);
    const raw = await dependencies.telemetry.measure('normalization', () => prepareBugbotFindings(
        agentResponse,
        execution.ignorePatterns,
        execution.analysis.minimumSeverity,
        execution.analysis.commentLimit,
        partitions.length > 0 ? MAX_AGGREGATE_PARTITION_FINDINGS : undefined,
    ));
    if (!raw) return undefined;
    const prepared = suppressDismissedFindings(execution, context, raw);
    return {
        ...prepared,
        resolvedFindingIds: filterEligibleBugbotResolutionIds(
            reconcileResolvedFindingIds(
                prepared.resolvedFindingIds,
                context.existingByFindingId,
                prepared.activeFindings ?? prepared.toPublish,
            ),
            context.eligibleResolutionIds,
            context.existingByFindingId,
        ),
    };
}

function partitionFailureCategory(error: unknown): string {
    if (error instanceof ApplicationError) return error.code;
    return error instanceof Error ? error.name : 'unknown';
}

function suppressDismissedFindings(
    execution: BugbotReviewOperationContext,
    context: BugbotContext,
    prepared: PreparedBugbotFindings,
): PreparedBugbotFindings {
    const activeFindings = retainExistingFindingIds(
        prepared.activeFindings ?? prepared.toPublish,
        context.existingByFindingId,
    ).filter((finding) => {
        const existing = findExistingFindingInfo(context.existingByFindingId, finding);
        return !hasProtectedBugbotDismissal(existing);
    });
    const limited = applyCommentLimit(activeFindings, execution.analysis.commentLimit);
    return { ...prepared, ...limited, activeFindings };
}

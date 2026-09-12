import type { FindingsQueryPort } from '../../../../ports/agent_findings_ports';
import { reconcileResolvedFindingIds } from '../../../../policies/bugbot_reconciliation_policy';
import { logInfo } from '../../../../ports/logging_ports';
import { applyCommentLimit } from './limit_comments';
import type { BugbotContext } from './types';
import { findExistingFindingInfo } from '../../../../../domain/bugbot/finding';
import { buildBugbotPrompt } from './build_bugbot_prompt';
import { prepareBugbotFindings } from './prepare_bugbot_findings';
import type { PreparedBugbotFindings } from './prepare_bugbot_findings';
import { queryBugbotFindings } from './query_bugbot_findings';
import type { BugbotReviewTelemetry } from './bugbot_review_telemetry';
import { filterEligibleBugbotResolutionIds } from '../../../../policies/bugbot_resolution_eligibility_policy';
import type { BugbotReviewOperationContext } from './bugbot_review_operation_context';

export interface AnalyzeBugbotRevisionDependencies {
    readonly agent: FindingsQueryPort;
    readonly telemetry: BugbotReviewTelemetry;
}

/** Pure analysis phase: query, validate, normalize, deduplicate and reconcile; never mutates the SCM. */
export async function analyzeBugbotRevision(
    execution: BugbotReviewOperationContext,
    context: BugbotContext,
    dependencies: AnalyzeBugbotRevisionDependencies,
): Promise<PreparedBugbotFindings | undefined> {
    const prompt = buildBugbotPrompt(execution, context);
    dependencies.telemetry.observeContext(context, prompt);
    logInfo('Detecting potential problems via configured agent using canonical change context...');
    const startedAt = Date.now();
    const agentResponse = await dependencies.telemetry.measure(
        'analysis',
        () => queryBugbotFindings(
            dependencies.agent,
            execution.analysis.agentConfiguration,
            prompt,
        ),
    );
    dependencies.telemetry.observeResponse(agentResponse);
    logInfo(`Bugbot reviewer completed in ${Date.now() - startedAt}ms.`);
    const raw = await dependencies.telemetry.measure('normalization', () => prepareBugbotFindings(
        agentResponse,
        execution.ignorePatterns,
        execution.analysis.minimumSeverity,
        execution.analysis.commentLimit,
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

function suppressDismissedFindings(
    execution: BugbotReviewOperationContext,
    context: BugbotContext,
    prepared: PreparedBugbotFindings,
): PreparedBugbotFindings {
    const activeFindings = (prepared.activeFindings ?? prepared.toPublish).filter((finding) => {
        const existing = findExistingFindingInfo(context.existingByFindingId, finding);
        return existing?.issue?.resolution !== 'dismissed' && existing?.pullRequest?.resolution !== 'dismissed';
    });
    const limited = applyCommentLimit(activeFindings, execution.analysis.commentLimit);
    return { ...prepared, ...limited, activeFindings };
}

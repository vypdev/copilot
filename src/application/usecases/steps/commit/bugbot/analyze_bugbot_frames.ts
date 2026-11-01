import type { FindingsQueryPort } from '../../../../ports/agent_findings_ports';
import type { BugbotContext } from './types';
import type { BugbotReviewOperationContext } from './bugbot_review_operation_context';
import type { BugbotReviewTelemetry } from './bugbot_review_telemetry';
import { buildBugbotReviewInput } from './build_bugbot_prompt';
import { queryBugbotPartitionFindings } from './query_bugbot_findings';
import { aggregateBugbotPartitionResponses } from './bugbot_partition_aggregation';
import { runWithConcurrencyLimit } from '../../../../policies/bounded_concurrency_policy';
import { bugbotReviewDigest, validateBugbotFramedReviewPlan, type BugbotFramedReviewPlan } from '../../../../policies/bugbot_framed_review_policy';
import { BugbotReviewCompletenessError, enforceBugbotFramedBudget } from '../../../../../domain/bugbot/framed_review';
import { logInfo } from '../../../../ports/logging_ports';

export function bugbotFramedContextDigest(operation: BugbotReviewOperationContext, context: BugbotContext): string {
    return bugbotReviewDigest([operation.analysis, operation.locale, operation.ignorePatterns,
        context.canonicalPullRequest, context.previousFindingsBlock, context.reviewConversationBlock ?? '',
        context.reviewRulesBlock ?? '', context.coverage, [...context.eligibleResolutionIds].sort().map(id => [id, context.existingByFindingId[id]])]);
}

/** All prompts preflight first. Frames retain no externally resumable or publishable partial state. */
export async function analyzeBugbotFrames(operation: BugbotReviewOperationContext, context: BugbotContext,
    plan: BugbotFramedReviewPlan, dependencies: {
        readonly agent: FindingsQueryPort; readonly telemetry: BugbotReviewTelemetry;
        readonly isSourceCurrent: () => Promise<boolean>;
    }) {
    validateBugbotFramedReviewPlan(plan, operation.ignorePatterns);
    let promptBytes = 0;
    const inputs = plan.partitions.map(partition => {
        const input = buildBugbotReviewInput(operation, context, { partition });
        const size = Buffer.byteLength(input.prompt);
        enforceBugbotFramedBudget('promptBytes', size);
        promptBytes += size; enforceBugbotFramedBudget('promptTotalBytes', promptBytes);
        return input;
    });
    dependencies.telemetry.observePartitionPlan(plan.partitions.length, plan.fragments.length, plan.retained);
    const targetLocale = operation.locale.pullRequest;
    const all: Readonly<Record<string, unknown>>[] = [];
    let retainedBytes = 0, findingCount = 0, consumedPromptBytes = 0;
    const observePrompt = (prompt: string) => {
        enforceBugbotFramedBudget('promptBytes', Buffer.byteLength(prompt));
        consumedPromptBytes += Buffer.byteLength(prompt);
        enforceBugbotFramedBudget('promptTotalBytes', consumedPromptBytes);
        dependencies.telemetry.observePrompt(prompt);
    };
    for (const frame of plan.frames) {
        if (bugbotFramedContextDigest(operation, context) !== plan.contextDigest
            || !(await dependencies.isSourceCurrent())) throw new BugbotReviewCompletenessError('identity');
        logInfo(`Bugbot complete review frame ${frame.ordinal}/${plan.frames.length} started; no result is final.`);
        const assigned = plan.partitions.filter(partition => partition.framed!.frameId === frame.id);
        if (bugbotReviewDigest(assigned.map(x => x.id)) !== bugbotReviewDigest(frame.partitionIds)) throw new BugbotReviewCompletenessError('coverage');
        const responses = await runWithConcurrencyLimit(assigned.map(partition => async () => {
            const input = inputs[partition.ordinal - 1];
            observePrompt(input.prompt);
            dependencies.telemetry.beginPartition();
            try {
                const response = await queryBugbotPartitionFindings(dependencies.agent, operation.analysis.agentConfiguration,
                    input.prompt, targetLocale, { partitionId: partition.id, headSha: partition.headSha, framed: partition.framed },
                    { enabled: input.hasLiteralWitnesses, observePrompt, observeResponse: value => { enforceBugbotFramedBudget('responseBytes', Buffer.byteLength(JSON.stringify(value) ?? '')); dependencies.telemetry.observeResponse(value); } });
                const serialized = JSON.stringify(response);
                enforceBugbotFramedBudget('responseBytes', Buffer.byteLength(serialized));
                const admitted: Readonly<Record<string, unknown>> = JSON.parse(serialized);
                if (!Array.isArray(admitted.findings) || !Array.isArray(admitted.resolved_findings)) throw new BugbotReviewCompletenessError('receipt');
                enforceBugbotFramedBudget('findingsPerResponse', admitted.findings.length);
                enforceBugbotFramedBudget('resolutions', admitted.resolved_findings.length);
                if (!partition.ownsResolution && admitted.resolved_findings.length > 0) throw new BugbotReviewCompletenessError('receipt');
                aggregateBugbotPartitionResponses([partition], [admitted]);
                findingCount += (admitted.findings as unknown[]).length;
                enforceBugbotFramedBudget('findings', findingCount);
                retainedBytes += Buffer.byteLength(serialized);
                enforceBugbotFramedBudget('resultBytes', retainedBytes);
                dependencies.telemetry.endPartition(true);
                return admitted;
            } catch (error) {
                dependencies.telemetry.endPartition(false, { ordinal: partition.ordinal, category: 'framed-review' });
                throw error;
            }
        }), 2);
        all.push(...responses);
        dependencies.telemetry.completeFrame();
    }
    validateBugbotFramedReviewPlan(plan, operation.ignorePatterns);
    if (bugbotFramedContextDigest(operation, context) !== plan.contextDigest
        || !(await dependencies.isSourceCurrent())) throw new BugbotReviewCompletenessError('identity');
    return aggregateBugbotPartitionResponses(plan.partitions, all);
}

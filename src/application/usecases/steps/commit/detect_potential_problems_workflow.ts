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
import { buildBugbotPrompt } from './bugbot/build_bugbot_prompt';
import { loadBugbotContext } from './bugbot/load_bugbot_context_use_case';
import { applyDetectedFindings, prepareDetectedFindings } from './bugbot/apply_detected_findings';
import { queryBugbotFindings } from './bugbot/query_bugbot_findings';

export interface DetectPotentialProblemsWorkflowDependencies {
    aiRepository: FindingsQueryPort;
    contextPorts: BugbotContextPorts;
    publicationPorts: BugbotFindingPublicationPorts;
    resolutionPorts: BugbotFindingResolutionPorts;
}

const TASK_ID = 'DetectPotentialProblemsUseCase';

/** Coordinates Bugbot context, analysis and finding publication behind application ports. */
export async function runDetectPotentialProblemsWorkflow(
    param: Execution,
    dependencies: DetectPotentialProblemsWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    try {
        if (!isAgentConfigurationReady(param.ai?.getAgentConfiguration('findings'))) {
            logDebugInfo('Agent not configured; skipping potential problems detection.');
            return [];
        }
        if (param.issueNumber === -1) {
            logDebugInfo('No issue number for this branch; skipping potential problems detection.');
            return [];
        }

        const context = await loadBugbotContext(param, undefined, dependencies.contextPorts);
        const prompt = buildBugbotPrompt(param, context);
        logInfo('Detecting potential problems via configured agent (agent computes changes and checks resolved)...');
        const prepared = prepareDetectedFindings(
            param,
            await queryBugbotFindings(dependencies.aiRepository, param, prompt),
        );
        if (prepared === undefined) {
            logDebugInfo('DetectPotentialProblems: No response from configured agent.');
            return [new Result({
                id: TASK_ID,
                success: false,
                executed: true,
                errors: [new Error('The configured agent returned no potential-problem analysis.')],
            })];
        }
        if (prepared.toPublish.length === 0 && prepared.resolvedFindingIds.size === 0) {
            return [new Result({
                id: TASK_ID,
                success: true,
                executed: true,
                steps: ['Potential problems detection completed (no new findings, no resolved).'],
            })];
        }

        const resolutionErrors = await applyDetectedFindings(
            param,
            context,
            prepared,
            dependencies.publicationPorts,
            dependencies.resolutionPorts,
        );
        const stepParts = [`${prepared.toPublish.length} new/current finding(s) from configured agent`];
        if (prepared.overflowCount > 0) stepParts.push(`${prepared.overflowCount} more not published (see summary comment)`);
        if (prepared.resolvedFindingIds.size > 0) stepParts.push(`${prepared.resolvedFindingIds.size} marked as resolved by configured agent`);
        return [new Result({
            id: TASK_ID,
            success: resolutionErrors.length === 0,
            executed: true,
            steps: [`Potential problems detection completed. ${stepParts.join('; ')}.`],
            errors: resolutionErrors,
        })];
    } catch (error) {
        const normalizedError = error instanceof PullRequestReviewOperationError
            ? error
            : new Error('Unable to detect potential problems.');
        const resultError = new Error(`Error in ${TASK_ID}: ${normalizedError.message}`);
        logError(resultError.message);
        return [new Result({
            id: TASK_ID,
            success: false,
            executed: true,
            errors: [resultError],
        })];
    }
}

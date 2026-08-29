import { isAgentConfigurationReady } from '../../../data/model/agent';
import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import { AGENT_PLAN } from '../../../application/policies/agent_task_policy';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import type { BranchListQueryPort } from '../../ports/branch_lifecycle_ports';
import { getCheckProgressPrompt } from '../../../prompts';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../../utils/project_context_instruction';
import { findIssueBranch } from './find_issue_branch';
import { validateProgressPrerequisites } from './progress_prerequisite_policy';
import {
    parseProgressResponse,
    PROGRESS_RESPONSE_SCHEMA,
    type ProgressAttemptResult,
} from './progress_response';

export interface ProgressAnalysisDependencies {
    issueDescriptionQueryPort: IssueDescriptionQueryPort;
    branchRepository: BranchListQueryPort;
    aiRepository: FindingsQueryPort;
}

export type ProgressAnalysis =
    | { kind: 'failure'; result: Result }
    | {
        kind: 'ready';
        issueNumber: number;
        branch: string;
        developmentBranch: string;
        attemptResult: ProgressAttemptResult;
    };

/** Loads progress context and asks the configured agent for an assessment. */
export async function analyzeProgress(
    param: Execution,
    taskId: string,
    dependencies: ProgressAnalysisDependencies,
): Promise<ProgressAnalysis> {
    const issueNumber = param.issueNumber;
    const agentReady = isAgentConfigurationReady(
        param.ai?.getAgentConfiguration('findings'),
    );
    if (!agentReady) {
        const message = 'Missing required agent configuration. Provide a model and a valid CLI command.';
        logError(message);
        return { kind: 'failure', result: failure(taskId, message) };
    }
    if (issueNumber === -1) {
        const message = 'Issue number not found. Cannot check progress without an issue number.';
        logError(message);
        return { kind: 'failure', result: failure(taskId, message) };
    }

    logInfo(`📋 Checking progress for issue #${issueNumber}`);
    const issueDescription = await dependencies.issueDescriptionQueryPort.getDescription(
        param.owner,
        param.repo,
        issueNumber,
        param.tokens.token,
    );
    if (!issueDescription) {
        const message = `Could not retrieve issue description for issue #${issueNumber}`;
        logError(message);
        return { kind: 'failure', result: failure(taskId, message) };
    }

    const branch = await findIssueBranch(param, dependencies.branchRepository);
    const prerequisiteError = validateProgressPrerequisites({
        agentReady,
        issueNumber,
        issueDescription,
        branch,
    });
    if (prerequisiteError) {
        logError(prerequisiteError);
        return {
            kind: 'failure',
            result: failure(
                taskId,
                branch
                    ? prerequisiteError
                    : `Could not find branch for issue #${issueNumber}. Please ensure a branch exists with pattern: feature/${issueNumber}-*, bugfix/${issueNumber}-*, docs/${issueNumber}-*, or chore/${issueNumber}-*`,
            ),
        };
    }

    const resolvedBranch = branch as string;
    const developmentBranch = param.branches.development || 'develop';
    logInfo(
        `📦 Progress will be assessed from workspace diff: base branch "${developmentBranch}", current branch "${resolvedBranch}" (configured agent will run git diff).`,
    );

    const prompt = getCheckProgressPrompt({
        projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
        issueNumber: String(issueNumber),
        issueDescription,
        baseBranch: developmentBranch,
        currentBranch: resolvedBranch,
    });
    logDebugInfo(
        `CheckProgress: prompt length=${prompt.length}, issue description length=${issueDescription.length}.`,
    );
    logInfo('🤖 Analyzing progress using the configured agent...');
    const attemptResult = parseProgressResponse(
        await dependencies.aiRepository.query({
            configuration: param.ai?.getAgentConfiguration('findings'),
            agentId: AGENT_PLAN,
            prompt,
            options: {
                expectJson: true,
                schema: PROGRESS_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
                schemaName: 'progress_response',
                includeReasoning: true,
            },
        }),
    );

    return {
        kind: 'ready',
        issueNumber,
        branch: resolvedBranch,
        developmentBranch,
        attemptResult,
    };
}

function failure(taskId: string, message: string): Result {
    return new Result({
        id: taskId,
        success: false,
        executed: true,
        errors: [message],
    });
}

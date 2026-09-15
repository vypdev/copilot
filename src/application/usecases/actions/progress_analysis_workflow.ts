import { isAgentConfigurationReady } from '../../../data/model/agent';
import { Result } from '../../../data/model/result';
import { AGENT_PLAN } from '../../../application/policies/agent_task_policy';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { BoundIssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import type { BoundBranchListQueryPort } from '../../ports/branch_lifecycle_ports';
import type { ProgressContext } from '../push_single_action_contexts';
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
import { ApplicationError, type ApplicationErrorCode } from '../../errors/application_error';
import { productFacingAgentQueryOptions } from '../../policies/agent_output_locale_policy';
import type { BoundPublicationSourceQueryPort } from '../../ports/publication_freshness_ports';

export interface ProgressAnalysisDependencies {
    issueDescriptionQueryPort: BoundIssueDescriptionQueryPort;
    branchRepository: BoundBranchListQueryPort;
    aiRepository: FindingsQueryPort;
    publicationSourceQuery: BoundPublicationSourceQueryPort;
}

export type ProgressAnalysis =
    | { kind: 'failure'; result: Result }
    | { kind: 'stale-source'; branch: string; sourceHeadSha: string }
    | {
        kind: 'ready';
        issueNumber: number;
        branch: string;
        developmentBranch: string;
        sourceHeadSha: string;
        attemptResult: ProgressAttemptResult;
    };

/** Loads progress context and asks the configured agent for an assessment. */
export async function analyzeProgress(
    param: ProgressContext,
    taskId: string,
    dependencies: ProgressAnalysisDependencies,
): Promise<ProgressAnalysis> {
    const issueNumber = param.issueNumber;
    const agentReady = isAgentConfigurationReady(
        param.agentConfiguration,
    );
    if (!agentReady) {
        const message = 'Missing required agent configuration. Provide a model and a valid executable.';
        logError(message);
        return { kind: 'failure', result: failure(taskId, message, 'configuration.invalid') };
    }
    if (issueNumber === -1) {
        const message = 'Issue number not found. Cannot check progress without an issue number.';
        logError(message);
        return { kind: 'failure', result: failure(taskId, message, 'validation.invalid-input') };
    }

    logInfo(`📋 Checking progress for issue #${issueNumber}`);
    const issueDescription = await dependencies.issueDescriptionQueryPort.getDescription(
        issueNumber,
    );
    if (!issueDescription) {
        const message = `Could not retrieve issue description for issue #${issueNumber}`;
        logError(message);
        return { kind: 'failure', result: failure(taskId, message, 'provider.not-found') };
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
                'provider.not-found',
            ),
        };
    }

    const resolvedBranch = branch as string;
    const sourceHeadSha = await dependencies.publicationSourceQuery.getBranchHeadSha(resolvedBranch);
    if (param.sourceHeadSha && param.sourceHeadSha !== sourceHeadSha) {
        return { kind: 'stale-source', branch: resolvedBranch, sourceHeadSha: param.sourceHeadSha };
    }
    const developmentBranch = param.developmentBranch;
    logInfo(
        `📦 Progress will be assessed from workspace diff: base branch "${developmentBranch}", current branch "${resolvedBranch}" (configured agent will run git diff).`,
    );

    const prompt = getCheckProgressPrompt({
        projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
        issueNumber: String(issueNumber),
        issueDescription,
        baseBranch: developmentBranch,
        currentBranch: resolvedBranch,
        targetLocale: param.targetLocale,
    });
    logDebugInfo(
        `CheckProgress: prompt length=${prompt.length}, issue description length=${issueDescription.length}.`,
    );
    logInfo('🤖 Analyzing progress using the configured agent...');
    const attemptResult = parseProgressResponse(
        await dependencies.aiRepository.query({
            configuration: param.agentConfiguration,
            agentId: AGENT_PLAN,
            prompt,
            options: {
                ...productFacingAgentQueryOptions('progress', PROGRESS_RESPONSE_SCHEMA),
                includeReasoning: param.includeReasoning,
            },
        }),
        param.targetLocale,
    );

    return {
        kind: 'ready',
        issueNumber,
        branch: resolvedBranch,
        developmentBranch,
        sourceHeadSha,
        attemptResult,
    };
}

function failure(taskId: string, message: string, code: ApplicationErrorCode): Result {
    return new Result({
        id: taskId,
        success: false,
        executed: true,
        errors: [new ApplicationError(code, message)],
    });
}

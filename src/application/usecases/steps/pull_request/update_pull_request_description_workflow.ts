import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import { AGENT_PLAN } from '../../../../application/policies/agent_task_policy';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { OrganizationMembersPort } from '../../../ports/organization_members_ports';
import type { PullRequestDescriptionCommandPort } from '../../../ports/pull_request_description_ports';
import { getUpdatePullRequestDescriptionPrompt } from '../../../../prompts';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../../../utils/project_context_instruction';
import { getTaskEmoji } from '../../../../utils/task_emoji';

export interface UpdatePullRequestDescriptionWorkflowDependencies {
    pullRequestDescriptionCommandPort: PullRequestDescriptionCommandPort;
    issueDescriptionQueryPort: IssueDescriptionQueryPort;
    organizationMembersPort: OrganizationMembersPort;
    aiRepository: FindingsQueryPort;
}

/** Generates and publishes a PR description while keeping provider details behind ports. */
export async function runUpdatePullRequestDescriptionWorkflow(
    param: Execution,
    taskId: string,
    dependencies: UpdatePullRequestDescriptionWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(taskId)} Executing ${taskId} (AI PR description).`);

    try {
        const branches = getPullRequestBranches(param);
        if (!branches) {
            return [
                new Result({
                    id: taskId,
                    success: false,
                    executed: false,
                    steps: [
                        `Could not determine PR branches (head: ${param.pullRequest.head ?? 'missing'}, base: ${param.pullRequest.base ?? 'missing'}). Skipping update pull request description.`,
                    ],
                }),
            ];
        }

        logDebugInfo(
            `PR description will be generated from workspace diff: base "${branches.baseBranch}", head "${branches.headBranch}" (configured agent will run git diff).`,
        );
        const issueDescription = (await dependencies.issueDescriptionQueryPort.getDescription(
            param.owner,
            param.repo,
            param.issueNumber,
            param.tokens.token,
        )) ?? '';
        if (issueDescription.length === 0) {
            return skipped(taskId, 'No issue description found. Skipping update pull request description.');
        }

        const currentProjectMembers = await dependencies.organizationMembersPort.getAllMembers(
            param.owner,
            param.tokens.token,
        );
        const creatorIsTeamMember = param.pullRequest.creator.length > 0
            && currentProjectMembers.includes(param.pullRequest.creator);
        if (!creatorIsTeamMember && param.ai.getAiMembersOnly()) {
            return skipped(
                taskId,
                `The pull request creator @${param.pullRequest.creator} is not a team member and \`AI members only\` is enabled. Skipping update pull request description.`,
            );
        }

        const prompt = getUpdatePullRequestDescriptionPrompt({
            projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
            baseBranch: branches.baseBranch,
            headBranch: branches.headBranch,
            issueNumber: String(param.issueNumber),
            issueDescription,
        });
        logDebugInfo(
            `UpdatePullRequestDescription: prompt length=${prompt.length}, issue description length=${issueDescription.length}. Calling configured agent.`,
        );
        const response = await dependencies.aiRepository.query({
            configuration: param.ai?.getAgentConfiguration('findings'),
            agentId: AGENT_PLAN,
            prompt,
        });
        const pullRequestBody = extractDescription(response);
        logDebugInfo(
            `UpdatePullRequestDescription: agent response received. Description length=${pullRequestBody.length}. Full description:\n${pullRequestBody}`,
        );
        if (!pullRequestBody.trim()) {
            return newResult(taskId, false, true, ['Configured agent did not return a PR description.']);
        }

        await dependencies.pullRequestDescriptionCommandPort.updateDescription(
            param.owner,
            param.repo,
            param.pullRequest.number,
            pullRequestBody,
            param.tokens.token,
        );
        return [new Result({ id: taskId, success: true, executed: true, steps: [] })];
    } catch (error) {
        logError(error);
        return [
            new Result({
                id: taskId,
                success: false,
                executed: true,
                steps: [`Error updating pull request description: ${error}`],
            }),
        ];
    }
}

function getPullRequestBranches(param: Execution): { headBranch: string; baseBranch: string } | undefined {
    const headBranch = param.pullRequest.head;
    const baseBranch = param.pullRequest.base;
    return headBranch && baseBranch ? { headBranch, baseBranch } : undefined;
}

function extractDescription(response: string | Record<string, unknown> | undefined): string {
    if (typeof response === 'string') return response;
    if (!response) return '';
    return typeof response.description === 'string' ? response.description : '';
}

function skipped(taskId: string, step: string): Result[] {
    return [new Result({ id: taskId, success: false, executed: false, steps: [step] })];
}

function newResult(taskId: string, success: boolean, executed: boolean, steps: string[]): Result[] {
    return [new Result({ id: taskId, success, executed, steps })];
}

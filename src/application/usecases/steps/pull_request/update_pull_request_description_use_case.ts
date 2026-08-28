import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import { AGENT_PLAN } from "../../../../application/policies/agent_task_policy";
import type { FindingsQueryPort } from "../../../ports/agent_findings_ports";
import type { IssueDescriptionQueryPort } from "../../../ports/issue_description_ports";
import type { OrganizationMembersPort } from "../../../ports/organization_members_ports";
import type { PullRequestDescriptionCommandPort } from "../../../ports/pull_request_description_ports";
import { getUpdatePullRequestDescriptionPrompt } from "../../../../prompts";
import { logDebugInfo, logError, logInfo } from "../../../../utils/logger";
import { PROJECT_CONTEXT_INSTRUCTION } from "../../../../utils/project_context_instruction";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class UpdatePullRequestDescriptionUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'UpdatePullRequestDescriptionUseCase';

    private aiRepository: FindingsQueryPort;
    constructor(
        private readonly pullRequestDescriptionCommandPort: PullRequestDescriptionCommandPort,
        private readonly issueDescriptionQueryPort: IssueDescriptionQueryPort,
        private readonly organizationMembersPort: OrganizationMembersPort,
        aiRepository: FindingsQueryPort,
    ) {
        this.aiRepository = aiRepository;
    }

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId} (AI PR description).`);

        const result: Result[] = [];

        try {
            const prNumber = param.pullRequest.number;
            const headBranch = param.pullRequest.head;
            const baseBranch = param.pullRequest.base;

            if (!headBranch || !baseBranch) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: false,
                        steps: [
                            `Could not determine PR branches (head: ${headBranch ?? 'missing'}, base: ${baseBranch ?? 'missing'}). Skipping update pull request description.`,
                        ],
                    })
                );
                return result;
            }

            logDebugInfo(
                `PR description will be generated from workspace diff: base "${baseBranch}", head "${headBranch}" (configured agent will run git diff).`
            );

            const issueDescription = (await this.issueDescriptionQueryPort.getDescription(
                param.owner,
                param.repo,
                param.issueNumber,
                param.tokens.token
            )) ?? '';

            if (issueDescription.length === 0) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: false,
                        steps: [
                            `No issue description found. Skipping update pull request description.`,
                        ],
                    })
                );
                return result;
            }

            const currentProjectMembers = await this.organizationMembersPort.getAllMembers(
                param.owner,
                param.tokens.token
            );
            const pullRequestCreatorIsTeamMember =
                param.pullRequest.creator.length > 0 &&
                currentProjectMembers.indexOf(param.pullRequest.creator) > -1;

            if (!pullRequestCreatorIsTeamMember && param.ai.getAiMembersOnly()) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: false,
                        steps: [
                            `The pull request creator @${param.pullRequest.creator} is not a team member and \`AI members only\` is enabled. Skipping update pull request description.`,
                        ],
                    })
                );
                return result;
            }

            const prompt = getUpdatePullRequestDescriptionPrompt({
                projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
                baseBranch,
                headBranch,
                issueNumber: String(param.issueNumber),
                issueDescription,
            });

            logDebugInfo(`UpdatePullRequestDescription: prompt length=${prompt.length}, issue description length=${issueDescription.length}. Calling configured agent.`);
            const agentResponse = await this.aiRepository.query({
                configuration: param.ai?.getAgentConfiguration('findings'),
                agentId: AGENT_PLAN,
                prompt,
            });

            const prBody =
                typeof agentResponse === 'string'
                    ? agentResponse
                    : (agentResponse && String((agentResponse as Record<string, unknown>).description)) || '';

            logDebugInfo(`UpdatePullRequestDescription: agent response received. Description length=${prBody.length}. Full description:\n${prBody}`);

            if (!prBody.trim()) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: [`Configured agent did not return a PR description.`],
                    })
                );
                return result;
            }

            await this.pullRequestDescriptionCommandPort.updateDescription(
                param.owner,
                param.repo,
                prNumber,
                prBody,
                param.tokens.token
            );

            result.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    steps: [],
                })
            );
        } catch (error) {
            logError(error);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [`Error updating pull request description: ${error}`],
                })
            );
        }

        return result;
    }
}

import { Result } from '../../../../data/model/result';
import { AGENT_PLAN } from '../../../../application/policies/agent_task_policy';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { BoundIssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { BoundOrganizationMembersPort } from '../../../ports/organization_members_ports';
import type { BoundPullRequestDescriptionPort } from '../../../ports/pull_request_description_ports';
import { getUpdatePullRequestDescriptionPrompt } from '../../../../prompts';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../../../utils/project_context_instruction';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import {
    mergeManagedPullRequestDescription,
    shouldAutomaticallyUpdatePullRequestDescription,
} from '../../../../domain/pull_request_description';
import { ApplicationError, toApplicationError } from '../../../errors/application_error';
import { parsePositiveSafeInteger } from '../../../../domain/positive_integer_policy';
import { PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA } from '../../../policies/agent_response_schemas';
import {
    agentOutputLocaleFailureMessage,
    productFacingAgentQueryOptions,
    validateAgentOutputLocale,
} from '../../../policies/agent_output_locale_policy';
import { renderPullRequestDescriptionContent } from '../../../policies/pull_request_description_content_policy';
import type {
    PullRequestDescriptionRequest,
    PullRequestDescriptionContext,
} from '../../pull_request_workflow_context';

export interface UpdatePullRequestDescriptionWorkflowDependencies {
    pullRequestDescriptionCommandPort: BoundPullRequestDescriptionPort;
    issueDescriptionQueryPort: BoundIssueDescriptionQueryPort;
    organizationMembersPort: BoundOrganizationMembersPort;
    aiRepository: FindingsQueryPort;
}

/** Generates and publishes a PR description from an immutable, capability-scoped request. */
export async function runUpdatePullRequestDescriptionWorkflow(
    request: PullRequestDescriptionRequest,
    taskId: string,
    dependencies: UpdatePullRequestDescriptionWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(taskId)} Executing ${taskId} (AI PR description).`);
    const { context } = request;
    try {
        if (!shouldRun(request)) {
            return skipped(taskId, `PR description updates are not enabled for the "${context.mode}" mode and "${request.trigger}" trigger.`);
        }
        if (!parsePositiveSafeInteger(context.pullRequest.number)) {
            return skipped(taskId, 'PR description updates require a positive pull-request number.');
        }

        const details = await loadPullRequestDetails(context, dependencies, request.trigger);
        const branches = resolveBranches(context, details);
        if (!branches) {
            return [new Result({
                id: taskId,
                success: false,
                executed: false,
                steps: [`Could not determine PR branches (head: ${context.pullRequest.headBranch || 'missing'}, base: ${context.pullRequest.baseBranch || 'missing'}). Skipping update pull request description.`],
            })];
        }

        logDebugInfo(
            `PR description will be generated from workspace diff: base "${branches.baseBranch}", head "${branches.headBranch}" (configured agent will run git diff).`,
        );
        const inferredIssueNumber = parsePositiveSafeInteger(context.issueNumber);
        const linkedIssueNumber = inferredIssueNumber !== context.pullRequest.number
            ? inferredIssueNumber
            : undefined;
        const issueDescription = linkedIssueNumber
            ? (await dependencies.issueDescriptionQueryPort.getDescription(linkedIssueNumber)) ?? ''
            : '';

        const currentProjectMembers = await dependencies.organizationMembersPort.getAllMembers();
        const creatorIsTeamMember = context.pullRequest.creator.length > 0
            && currentProjectMembers.includes(context.pullRequest.creator);
        if (!creatorIsTeamMember && context.membersOnly) {
            return skipped(
                taskId,
                `The pull request creator @${context.pullRequest.creator} is not a team member and \`AI members only\` is enabled. Skipping update pull request description.`,
            );
        }

        const prompt = getUpdatePullRequestDescriptionPrompt({
            projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
            baseBranch: branches.baseBranch,
            headBranch: branches.headBranch,
            issueNumber: linkedIssueNumber ? String(linkedIssueNumber) : 'not linked',
            issueDescription: issueDescription || 'No linked issue description is available. Infer intent from the pull request title, body, and diff.',
            relatedIssueInstruction: linkedIssueNumber
                ? `Set \`closesLinkedIssue\` to true only when this PR fully resolves issue #${linkedIssueNumber}; otherwise set it to false. Do not put the closing reference in another field.`
                : 'Set `closesLinkedIssue` to false because this pull request has no separate linked issue.',
            targetLocale: context.targetLocale,
        });
        logDebugInfo(
            `UpdatePullRequestDescription: prompt length=${prompt.length}, issue description length=${issueDescription.length}. Calling configured agent.`,
        );
        const response = await dependencies.aiRepository.query({
            configuration: context.agentConfiguration,
            agentId: AGENT_PLAN,
            prompt,
            options: productFacingAgentQueryOptions(
                'pull-request-description',
                PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA,
            ),
        });
        const generatedDescription = extractDescription(response, context.targetLocale, linkedIssueNumber);

        const currentBody = details?.body ?? context.pullRequest.body;
        const pullRequestBody = context.mode === 'replace'
            ? generatedDescription
            : mergeManagedPullRequestDescription(currentBody, generatedDescription);
        await dependencies.pullRequestDescriptionCommandPort.updateDescription(
            context.pullRequest.number,
            pullRequestBody,
        );
        return [new Result({ id: taskId, success: true, executed: true, steps: [] })];
    } catch (cause) {
        const semanticError = toApplicationError(cause, 'workflow.failed', 'Unable to update pull request description.');
        logError(semanticError);
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: [semanticError.message],
            errors: [semanticError],
        })];
    }
}

function shouldRun(request: PullRequestDescriptionRequest): boolean {
    if (request.context.mode === 'disabled') return false;
    return request.trigger === 'authorized-command'
        || shouldAutomaticallyUpdatePullRequestDescription(request.context.mode);
}

function resolveBranches(
    context: PullRequestDescriptionContext,
    details?: { readonly headBranch: string; readonly baseBranch: string },
): { headBranch: string; baseBranch: string } | undefined {
    const headBranch = context.pullRequest.headBranch || details?.headBranch;
    const baseBranch = context.pullRequest.baseBranch || details?.baseBranch;
    return headBranch && baseBranch ? { headBranch, baseBranch } : undefined;
}

async function loadPullRequestDetails(
    context: PullRequestDescriptionContext,
    dependencies: UpdatePullRequestDescriptionWorkflowDependencies,
    trigger: PullRequestDescriptionRequest['trigger'],
): Promise<{ body: string; headBranch: string; baseBranch: string } | undefined> {
    const needsRemoteDetails = context.eventName === 'issue_comment'
        || trigger === 'authorized-command'
        || !context.pullRequest.headBranch
        || !context.pullRequest.baseBranch;
    return needsRemoteDetails
        ? dependencies.pullRequestDescriptionCommandPort.getDetails(context.pullRequest.number)
        : undefined;
}

function extractDescription(
    response: string | Record<string, unknown> | undefined,
    targetLocale: string,
    linkedIssueNumber?: number,
): string {
    if (response == null) {
        throw new ApplicationError('agent.failed', 'Configured agent did not return PR description content. Existing body retained.');
    }
    const validation = validateAgentOutputLocale(response, targetLocale);
    if (validation.kind === 'invalid') {
        throw new ApplicationError('locale.output-invalid', agentOutputLocaleFailureMessage(validation));
    }
    const rendered = renderPullRequestDescriptionContent(validation.payload, targetLocale, linkedIssueNumber);
    if (rendered.kind === 'invalid') {
        throw new ApplicationError(
            'agent.failed',
            `Configured agent returned PR content that failed the concise description contract (${rendered.reason}). Existing body retained.`,
        );
    }
    return rendered.markdown;
}

function skipped(taskId: string, step: string): Result[] {
    return [new Result({ id: taskId, success: false, executed: false, steps: [step] })];
}

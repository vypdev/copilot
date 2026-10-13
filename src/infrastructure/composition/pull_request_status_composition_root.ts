import type { CopilotStatusReadPorts } from '../../application/usecases/read_copilot_status_workflow';
import type { BoundBugbotContextReadPorts } from '../../application/ports/bugbot_context_ports';
import type { BugbotScmBinding } from './bugbot_scm_port_factory';
import { PullRequestStatusQueryRepository } from '../../data/repository/pull_request/pull_request_status_query_repository';
import { PullRequestApprovalRepository } from '../../data/repository/pull_request/pull_request_approval_repository';
import { getGithubActionInput } from '../github_action_input';
import { parseDelimitedValues } from '../../domain/input_values_policy';
import type { ApprovalObservationTarget } from '../../application/ports/pull_request_approval_ports';
/** Physically narrow facade: constructing a query cannot expose the observer's write operations. */
export function createPullRequestStatusReadPorts(binding: BugbotScmBinding, context: BoundBugbotContextReadPorts): CopilotStatusReadPorts {
    const query = new PullRequestStatusQueryRepository(binding.owner, binding.repository, binding.token);
    const approval = new PullRequestApprovalRepository(binding.token, {
        mainBranch: getGithubActionInput('main-branch') || 'master', developmentBranch: getGithubActionInput('development-branch') || 'develop',
        branchPrefixes: { feature: getGithubActionInput('feature-tree') || 'feature', bugfix: getGithubActionInput('bugfix-tree') || 'bugfix',
            documentation: getGithubActionInput('docs-tree') || 'docs', chore: getGithubActionInput('chore-tree') || 'chore' },
        bugbotSeverity: getGithubActionInput('bugbot-severity') || 'low', bugbotDryRun: getGithubActionInput('bugbot-dry-run') === 'true',
        bugbotIgnorePatterns: parseDelimitedValues(getGithubActionInput('ai-ignore-files')),
        githubToken: process.env.COPILOT_APPROVAL_CHECK_TOKEN,
    });
    return Object.freeze({ serverOrigin: process.env.GITHUB_SERVER_URL ?? 'https://github.com',
        getPullRequest: (number: number) => context.getPullRequest(number), listIssueComments: (number: number) => context.listIssueComments(number),
        getPullRequestHeadSha: (number: number) => context.getPullRequestHeadSha(number),
        readLinkedPullRequests: (number: number) => query.readLinkedPullRequests(number),
        approval: Object.freeze({ readPolicy: (target: ApprovalObservationTarget) => approval.readPolicy(target), loadEvidence: (target: ApprovalObservationTarget) => approval.loadEvidence(target),
            readRevision: (target: ApprovalObservationTarget) => query.readRevision(target) }),
    });
}

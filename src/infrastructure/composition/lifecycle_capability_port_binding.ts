import type {
  ActorAuthorizationPort,
  BoundActorAuthorizationPort,
} from '../../application/ports/actor_authorization_ports';
import type {
  BoundBranchLifecyclePort,
  BranchLifecyclePort,
} from '../../application/ports/branch_lifecycle_ports';
import type {
  BoundLinkedBranchCommandPort,
  LinkedBranchCommandPort,
} from '../../application/ports/branch_preparation_ports';
import type {
  BoundBranchWorkflowPort,
  BranchWorkflowPort,
} from '../../application/ports/branch_workflow_ports';
import type {
  BoundIssueClosurePort,
  IssueClosurePort,
} from '../../application/ports/issue_lifecycle_ports';
import type {
  BoundIssueAssigneePort,
  BoundIssueLabelsPort,
  BoundPullRequestHeadShaPort,
  BoundIssueTypeAssignmentPort,
  IssueAssigneePort,
  IssueLabelsPort,
  PullRequestHeadShaPort,
  IssueTypeAssignmentPort,
} from '../../application/ports/issue_management_ports';
import type {
  BoundOrganizationMemberSelectionPort,
  OrganizationMembersPort,
} from '../../application/ports/organization_members_ports';
import type {
  BoundProjectBoardCommandPort,
  ProjectBoardCommandPort,
} from '../../application/ports/project_board_command_ports';
import type {
  BoundPullRequestDescriptionPort,
  PullRequestDescriptionCommandPort,
} from '../../application/ports/pull_request_description_ports';
import type {
  BoundPullRequestIssueLinkPort,
  PullRequestIssueLinkPort,
} from '../../application/ports/pull_request_issue_link_ports';
import type {
  BoundPullRequestReviewerPort,
  PullRequestReviewerPort,
} from '../../application/ports/pull_request_reviewer_ports';
import { ProjectDetail } from '../../data/model/project_detail';
import type { ProjectReference } from '../../application/ports/project_board_link_ports';
import type { RepositoryCredentialBinding } from './shared_capability_port_binding';

export function bindActorAuthorization(
  port: ActorAuthorizationPort,
  binding: RepositoryCredentialBinding,
): BoundActorAuthorizationPort {
  return Object.freeze({
    isActorAllowedToModifyFiles: (actor) => port.isActorAllowedToModifyFiles(
      binding.owner,
      binding.repository,
      actor,
      binding.token,
    ),
  } satisfies BoundActorAuthorizationPort);
}

export function bindIssueAssignee(
  port: IssueAssigneePort,
  binding: RepositoryCredentialBinding,
): BoundIssueAssigneePort {
  return Object.freeze({
    getCurrentAssignees: (issueNumber) => port.getCurrentAssignees(
      binding.owner,
      binding.repository,
      issueNumber,
      binding.token,
    ),
    assignMembersToIssue: (issueNumber, members) => port.assignMembersToIssue(
      binding.owner,
      binding.repository,
      issueNumber,
      [...members],
      binding.token,
    ),
  } satisfies BoundIssueAssigneePort);
}

export function bindOrganizationMemberSelection(
  port: OrganizationMembersPort,
  binding: RepositoryCredentialBinding,
): BoundOrganizationMemberSelectionPort {
  return Object.freeze({
    getAllMembers: () => port.getAllMembers(binding.owner, binding.token),
    getRandomMembers: (membersToAdd, currentMembers) => port.getRandomMembers(
      binding.owner,
      membersToAdd,
      [...currentMembers],
      binding.token,
    ),
  } satisfies BoundOrganizationMemberSelectionPort);
}

export function bindPullRequestReviewer(
  port: PullRequestReviewerPort,
  binding: RepositoryCredentialBinding,
): BoundPullRequestReviewerPort {
  return Object.freeze({
    getCurrentReviewers: (pullRequestNumber) => port.getCurrentReviewers(
      binding.owner,
      binding.repository,
      pullRequestNumber,
      binding.token,
    ),
    addReviewersToPullRequest: (pullRequestNumber, reviewers) => port.addReviewersToPullRequest(
      binding.owner,
      binding.repository,
      pullRequestNumber,
      [...reviewers],
      binding.token,
    ),
  } satisfies BoundPullRequestReviewerPort);
}

export function bindIssueClosure(
  port: IssueClosurePort,
  binding: RepositoryCredentialBinding,
): BoundIssueClosurePort {
  return Object.freeze({
    closeIssue: (issueNumber) => port.closeIssue(
      binding.owner,
      binding.repository,
      issueNumber,
      binding.token,
    ),
    addComment: (issueNumber, comment) => port.addComment(
      binding.owner,
      binding.repository,
      issueNumber,
      comment,
      binding.token,
    ),
  } satisfies BoundIssueClosurePort);
}

export function bindIssueTypeAssignment(
  port: IssueTypeAssignmentPort,
  binding: RepositoryCredentialBinding,
): BoundIssueTypeAssignmentPort {
  return Object.freeze({
    setIssueType: (issueNumber, issueType) => port.setIssueType(
      binding.owner,
      binding.repository,
      issueNumber,
      issueType,
      binding.token,
    ),
  } satisfies BoundIssueTypeAssignmentPort);
}

export function bindProjectBoardCommands(
  port: ProjectBoardCommandPort,
  binding: RepositoryCredentialBinding,
): BoundProjectBoardCommandPort {
  return Object.freeze({
    setTaskPriority: (project, contentNumber, priorityLabel) => port.setTaskPriority(
      toProjectDetail(project),
      binding.owner,
      binding.repository,
      contentNumber,
      priorityLabel,
      binding.token,
    ),
    setTaskSize: (project, contentNumber, sizeLabel) => port.setTaskSize(
      toProjectDetail(project),
      binding.owner,
      binding.repository,
      contentNumber,
      sizeLabel,
      binding.token,
    ),
    moveIssueToColumn: (project, contentNumber, columnName) => port.moveIssueToColumn(
      toProjectDetail(project),
      binding.owner,
      binding.repository,
      contentNumber,
      columnName,
      binding.token,
    ),
  } satisfies BoundProjectBoardCommandPort);
}

export function bindBranchLifecycle(
  port: BranchLifecyclePort,
  binding: RepositoryCredentialBinding,
): BoundBranchLifecyclePort {
  return Object.freeze({
    getListOfBranches: () => port.getListOfBranches(
      binding.owner,
      binding.repository,
      binding.token,
    ),
    removeBranch: (branch) => port.removeBranch(
      binding.owner,
      binding.repository,
      branch,
      binding.token,
    ),
  } satisfies BoundBranchLifecyclePort);
}

export function bindLinkedBranchCommand(
  port: LinkedBranchCommandPort,
  binding: RepositoryCredentialBinding,
): BoundLinkedBranchCommandPort {
  return Object.freeze({
    createLinkedBranch: (baseBranch, newBranch, issueNumber, oid) => port.createLinkedBranch(
      binding.owner,
      binding.repository,
      baseBranch,
      newBranch,
      issueNumber,
      oid,
      binding.token,
    ),
  } satisfies BoundLinkedBranchCommandPort);
}

export function bindBranchWorkflow(
  port: BranchWorkflowPort,
  binding: RepositoryCredentialBinding,
): BoundBranchWorkflowPort {
  return Object.freeze({
    executeWorkflow: (branch, workflow, inputs) => port.executeWorkflow(
      binding.owner,
      binding.repository,
      branch,
      workflow,
      { ...inputs },
      binding.token,
    ),
  } satisfies BoundBranchWorkflowPort);
}

export function bindPullRequestIssueLink(
  port: PullRequestIssueLinkPort,
  binding: RepositoryCredentialBinding,
): BoundPullRequestIssueLinkPort {
  return Object.freeze({
    isLinked: (pullRequestNumber) => port.isLinked(
      binding.owner,
      binding.repository,
      pullRequestNumber,
      binding.token,
    ),
    getDetails: (pullRequestNumber) => port.getDetails(
      binding.owner,
      binding.repository,
      pullRequestNumber,
      binding.token,
    ),
    updateBaseBranch: (pullRequestNumber, baseBranch) => port.updateBaseBranch(
      binding.owner,
      binding.repository,
      pullRequestNumber,
      baseBranch,
      binding.token,
    ),
    updateDescription: (pullRequestNumber, description) => port.updateDescription(
      binding.owner,
      binding.repository,
      pullRequestNumber,
      description,
      binding.token,
    ),
  } satisfies BoundPullRequestIssueLinkPort);
}

export function bindIssueLabels(
  port: IssueLabelsPort,
  binding: RepositoryCredentialBinding,
): BoundIssueLabelsPort {
  const { owner, repository, token } = binding;
  return Object.freeze({
    getLabels: (issueNumber) => port.getLabels(
      owner,
      repository,
      issueNumber,
      token,
    ),
    setLabels: (issueNumber, labels) => port.setLabels(
      owner,
      repository,
      issueNumber,
      [...labels],
      token,
    ),
  } satisfies BoundIssueLabelsPort);
}

export function bindPullRequestHeadSha(
  port: PullRequestHeadShaPort,
  binding: RepositoryCredentialBinding,
): BoundPullRequestHeadShaPort {
  const { owner, repository, token } = binding;
  return Object.freeze({
    getPullRequestHeadSha: (pullRequestNumber) => port.getPullRequestHeadSha(
      owner,
      repository,
      pullRequestNumber,
      token,
    ),
  } satisfies BoundPullRequestHeadShaPort);
}

export function bindPullRequestDescription(
  port: PullRequestDescriptionCommandPort,
  binding: RepositoryCredentialBinding,
): BoundPullRequestDescriptionPort {
  return Object.freeze({
    updateDescription: (pullRequestNumber, description) => port.updateDescription(
      binding.owner,
      binding.repository,
      pullRequestNumber,
      description,
      binding.token,
    ),
    getDetails: async (pullRequestNumber) => {
      if (!port.getDetails) throw new Error('Pull-request details query is not available.');
      return port.getDetails(
        binding.owner,
        binding.repository,
        pullRequestNumber,
        binding.token,
      );
    },
  } satisfies BoundPullRequestDescriptionPort);
}

function toProjectDetail(project: ProjectReference): ProjectDetail {
  return new ProjectDetail({ ...project });
}

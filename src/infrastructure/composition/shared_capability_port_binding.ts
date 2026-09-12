import type { BoundIssueDescriptionQueryPort } from '../../application/ports/issue_description_ports';
import type {
  BoundIssueCommentUpdatePort,
  BoundIssueNotificationPort,
  IssueCommentUpdatePort,
  IssueNotificationPort,
} from '../../application/ports/issue_lifecycle_ports';
import type { IssueDescriptionQueryPort } from '../../application/ports/issue_description_ports';
import type {
  BoundIssueTitlePort,
  IssueTitlePort,
} from '../../application/ports/issue_title_ports';
import type { BoundOrganizationMembersPort, OrganizationMembersPort } from '../../application/ports/organization_members_ports';
import type { ProjectBoardCommandPort } from '../../application/ports/project_board_command_ports';
import type {
  BoundProjectContentPort,
  ProjectBoardLinkPort,
  ProjectReference,
} from '../../application/ports/project_board_link_ports';
import type { IssueIdentityQueryPort } from '../../application/ports/issue_identity_ports';
import { ProjectDetail } from '../../data/model/project_detail';

export interface RepositoryCredentialBinding {
  readonly owner: string;
  readonly repository: string;
  readonly token: string;
}

export function bindOrganizationMembers(
  port: OrganizationMembersPort,
  binding: RepositoryCredentialBinding,
): BoundOrganizationMembersPort {
  return {
    getAllMembers: () => port.getAllMembers(binding.owner, binding.token),
  };
}

export function bindIssueDescriptionQuery(
  port: IssueDescriptionQueryPort,
  binding: RepositoryCredentialBinding,
): BoundIssueDescriptionQueryPort {
  return {
    getDescription: (issueNumber) => port.getDescription(
      binding.owner,
      binding.repository,
      issueNumber,
      binding.token,
    ),
  };
}

export function bindIssueNotification(
  port: IssueNotificationPort,
  binding: RepositoryCredentialBinding,
): BoundIssueNotificationPort {
  return {
    addComment: (issueNumber, comment) => port.addComment(
      binding.owner,
      binding.repository,
      issueNumber,
      comment,
      binding.token,
    ),
  };
}

export function bindIssueCommentUpdate(
  port: IssueCommentUpdatePort,
  binding: RepositoryCredentialBinding,
): BoundIssueCommentUpdatePort {
  return {
    updateComment: (issueNumber, commentId, comment) => port.updateComment(
      binding.owner,
      binding.repository,
      issueNumber,
      commentId,
      comment,
      binding.token,
    ),
  };
}

export function bindIssueTitle(
  port: IssueTitlePort,
  binding: RepositoryCredentialBinding,
): BoundIssueTitlePort {
  return {
    getTitle: (issueNumber) => port.getTitle(
      binding.owner,
      binding.repository,
      issueNumber,
      binding.token,
    ),
    updateIssueTitle: (input) => port.updateTitleIssueFormat(
      binding.owner,
      binding.repository,
      input.version,
      input.currentTitle,
      input.issueNumber,
      input.branchManagementAlways,
      input.branchManagementEmoji,
      input.labelFacts,
      binding.token,
    ),
    updatePullRequestTitle: (input) => port.updateTitlePullRequestFormat(
      binding.owner,
      binding.repository,
      input.pullRequestTitle,
      input.issueTitle,
      input.issueNumber,
      input.pullRequestNumber,
      false,
      '',
      input.labelFacts,
      binding.token,
    ),
  };
}

export function bindProjectContent(
  identity: IssueIdentityQueryPort,
  commands: ProjectBoardCommandPort,
  links: ProjectBoardLinkPort,
  binding: RepositoryCredentialBinding,
): BoundProjectContentPort {
  return {
    resolveIssueContentId: (issueNumber) => identity.getId(
      binding.owner,
      binding.repository,
      issueNumber,
      binding.token,
    ),
    linkContentId: (project, contentId) => links.linkContentId(
      toProjectDetail(project),
      contentId,
      binding.token,
    ),
    moveContent: (project, contentNumber, columnName) => commands.moveIssueToColumn(
      toProjectDetail(project),
      binding.owner,
      binding.repository,
      contentNumber,
      columnName,
      binding.token,
    ),
  };
}

function toProjectDetail(project: ProjectReference): ProjectDetail {
  return new ProjectDetail({ ...project });
}

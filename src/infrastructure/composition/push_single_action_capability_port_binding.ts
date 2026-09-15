import type { AuthenticatedUserPort, BoundAuthenticatedUserPort } from '../../application/ports/authenticated_user_ports';
import type { BranchChangeSizePort, BoundBranchChangeSizePort } from '../../application/ports/branch_change_ports';
import type { BranchListQueryPort, BoundBranchListQueryPort } from '../../application/ports/branch_lifecycle_ports';
import type {
  BoundBranchDependencyQueryPort,
  BoundBranchSyncComparisonPort,
  BoundBranchSyncWorkspacePort,
  BranchDependencyQueryPort,
  BranchSyncComparisonPort,
  BranchSyncWorkspacePort,
} from '../../application/ports/branch_sync_ports';
import type {
  BoundIssueCommentPublicationPort,
  BoundIssueReopenPort,
  IssueCommentPublicationPort,
  IssueNotificationPort,
} from '../../application/ports/issue_lifecycle_ports';
import type {
  BoundInitialLabelProvisioningPort,
  BoundIssueProgressPort,
  BoundIssueTypeProvisioningPort,
  InitialLabelProvisioningPort,
  IssueProgressPort,
  IssueTypeProvisioningPort,
} from '../../application/ports/issue_management_ports';
import type { BoundIssueInactivityQueryPort, IssueInactivityQueryPort } from '../../application/ports/issue_inactivity_ports';
import type { BoundPullRequestBranchQueryPort, PullRequestBranchQueryPort } from '../../application/ports/pull_request_branch_ports';
import type {
  BoundRepositoryDefaultBranchPort,
  BoundRepositoryReleasePublicationPort,
  BoundRepositoryTagPort,
  RepositoryDefaultBranchPort,
  RepositoryReleasePublicationPort,
  RepositoryTagPort,
} from '../../application/ports/repository_release_ports';
import type {
  BoundSetupRemoteConfigurationReadPort,
  BoundSetupRepositorySecretsCommandPort,
  BoundSetupRepositoryVariablesCommandPort,
  SetupRemoteConfigurationReadPort,
  SetupRepositorySecretsCommandPort,
  SetupRepositoryVariablesCommandPort,
} from '../../application/ports/setup_wizard_ports';
import type { BoundSetupWorkspacePort, SetupWorkspacePort } from '../../application/ports/setup_workspace_ports';
import type { RepositoryCredentialBinding } from './shared_capability_port_binding';
import type {
  BoundDeploymentContinuationPort,
  BoundDeploymentGitPort,
  BoundDeploymentPresentationPort,
  BoundDeploymentPublicationReceiptPort,
  BoundDeploymentStateStoreFactoryPort,
  BoundManagedPullRequestPort,
  BoundTargetMergePolicyInspectionPort,
  DeploymentContinuationPort,
  DeploymentGitPort,
  DeploymentPresentationPort,
  DeploymentPublicationReceiptPort,
  DeploymentStateStoreFactoryPort,
  ManagedPullRequestPort,
  TargetMergePolicyInspectionPort,
} from '../../application/ports/deployment_orchestration_ports';
import type { BoundIssueClosurePort, IssueClosurePort } from '../../application/ports/issue_lifecycle_ports';
import type { BoundIssueLabelsPort, IssueLabelsPort } from '../../application/ports/issue_management_ports';

export function bindManagedPullRequests(
  port: ManagedPullRequestPort,
  binding: RepositoryCredentialBinding,
): BoundManagedPullRequestPort {
  return Object.freeze({
    findManagedPullRequests: (query) => port.findManagedPullRequests({ ...query, owner: binding.owner, repository: binding.repository, token: binding.token }),
    createManagedPullRequest: (command) => port.createManagedPullRequest({ ...command, owner: binding.owner, repository: binding.repository, token: binding.token }),
    getPullRequest: (pullRequest) => port.getPullRequest(binding.owner, binding.repository, pullRequest, binding.token),
    enableAutoMerge: (pullRequestNodeId) => port.enableAutoMerge(binding.owner, binding.repository, pullRequestNodeId, binding.token),
    isPullRequestQueued: (pullRequestNodeId) => port.isPullRequestQueued(binding.owner, binding.repository, pullRequestNodeId, binding.token),
    enqueuePullRequest: (pullRequestNodeId, expectedHeadSha) => port.enqueuePullRequest(binding.owner, binding.repository, pullRequestNodeId, expectedHeadSha, binding.token),
    mergePullRequest: (pullRequest) => port.mergePullRequest(binding.owner, binding.repository, pullRequest, binding.token),
  } satisfies BoundManagedPullRequestPort);
}

export function bindDeploymentTargetRules(
  port: TargetMergePolicyInspectionPort,
  binding: RepositoryCredentialBinding,
): BoundTargetMergePolicyInspectionPort {
  return Object.freeze({
    getTargetCapabilities: (targetBranch, options) => port.getTargetCapabilities(
      binding.owner,
      binding.repository,
      targetBranch,
      binding.token,
      options,
    ),
  } satisfies BoundTargetMergePolicyInspectionPort);
}

export function bindDeploymentGit(
  port: DeploymentGitPort,
  binding: RepositoryCredentialBinding,
): BoundDeploymentGitPort {
  return Object.freeze({
    getBranchSha: (branch) => port.getBranchSha(binding.owner, binding.repository, branch, binding.token),
    getMergeBaseSha: (base, head) => port.getMergeBaseSha(binding.owner, binding.repository, base, head, binding.token),
    isCommitReachable: (branch, sha) => port.isCommitReachable(binding.owner, binding.repository, branch, sha, binding.token),
    createOrVerifyBranch: (branch, sha) => port.createOrVerifyBranch(binding.owner, binding.repository, branch, sha, binding.token),
    mergeCommitIntoBranch: (branch, sourceSha) => port.mergeCommitIntoBranch(binding.owner, binding.repository, branch, sourceSha, binding.token),
    deleteBranch: (branch, expectedSha) => port.deleteBranch(binding.owner, binding.repository, branch, expectedSha, binding.token),
    listBranches: (prefix) => port.listBranches(binding.owner, binding.repository, prefix, binding.token),
  } satisfies BoundDeploymentGitPort);
}

export function bindDeploymentContinuation(
  port: DeploymentContinuationPort,
  binding: RepositoryCredentialBinding,
): BoundDeploymentContinuationPort {
  return Object.freeze({
    dispatch: (workflow, ref, operationId, issue, version) => port.dispatch(
      binding.owner,
      binding.repository,
      workflow,
      ref,
      operationId,
      issue,
      version,
      binding.token,
    ),
  } satisfies BoundDeploymentContinuationPort);
}

export function bindDeploymentPresentation(
  port: DeploymentPresentationPort,
  binding: RepositoryCredentialBinding,
): BoundDeploymentPresentationPort {
  return Object.freeze({
    findDashboard: (issue, marker) => port.findDashboard(binding.owner, binding.repository, issue, marker, binding.token),
    createDashboard: (issue, body) => port.createDashboard(binding.owner, binding.repository, issue, body, binding.token),
    updateDashboard: (issue, commentId, body) => port.updateDashboard(binding.owner, binding.repository, issue, commentId, body, binding.token),
    publishMilestone: (issue, marker, body) => port.publishMilestone(binding.owner, binding.repository, issue, marker, body, binding.token),
  } satisfies BoundDeploymentPresentationPort);
}

export function bindDeploymentPublicationReceipt(
  port: DeploymentPublicationReceiptPort,
  binding: RepositoryCredentialBinding,
): BoundDeploymentPublicationReceiptPort {
  return Object.freeze({
    inspect: (command) => port.inspect({
      ...command,
      owner: binding.owner,
      repository: binding.repository,
      token: binding.token,
    }),
  } satisfies BoundDeploymentPublicationReceiptPort);
}

export function bindDeploymentState(
  port: DeploymentStateStoreFactoryPort,
  binding: RepositoryCredentialBinding,
): BoundDeploymentStateStoreFactoryPort {
  return Object.freeze({
    bind: (issue) => port.bind({ ...binding, issue }),
  } satisfies BoundDeploymentStateStoreFactoryPort);
}

export function bindDeploymentLabels(
  port: IssueLabelsPort,
  binding: RepositoryCredentialBinding,
): BoundIssueLabelsPort {
  return Object.freeze({
    getLabels: (issue) => port.getLabels(binding.owner, binding.repository, issue, binding.token),
    setLabels: (issue, labels) => port.setLabels(binding.owner, binding.repository, issue, [...labels], binding.token),
  } satisfies BoundIssueLabelsPort);
}

export function bindDeploymentIssues(
  port: IssueClosurePort,
  binding: RepositoryCredentialBinding,
): BoundIssueClosurePort {
  return Object.freeze({
    closeIssue: (issue) => port.closeIssue(binding.owner, binding.repository, issue, binding.token),
    addComment: (issue, comment) => port.addComment(binding.owner, binding.repository, issue, comment, binding.token),
  } satisfies BoundIssueClosurePort);
}

export function bindRepositoryTag(
  port: RepositoryTagPort,
  binding: RepositoryCredentialBinding,
): BoundRepositoryTagPort {
  return Object.freeze<BoundRepositoryTagPort>({
    updateTag: (sourceTag, targetTag) => port.updateTag(binding.owner, binding.repository, sourceTag, targetTag, binding.token),
    createTag: (branch, tag) => port.createTag(binding.owner, binding.repository, branch, tag, binding.token),
    createOrVerifyTagAtSha: (sha, tag) => port.createOrVerifyTagAtSha(binding.owner, binding.repository, sha, tag, binding.token),
  });
}

export function bindRepositoryRelease(
  port: RepositoryReleasePublicationPort,
  binding: RepositoryCredentialBinding,
): BoundRepositoryReleasePublicationPort {
  return Object.freeze<BoundRepositoryReleasePublicationPort>({
    updateRelease: (sourceTag, targetTag) => port.updateRelease(binding.owner, binding.repository, sourceTag, targetTag, binding.token),
    createRelease: (version, title, changelog, operationId, productionSha) => port.createRelease(
      binding.owner,
      binding.repository,
      version,
      title,
      changelog,
      operationId,
      productionSha,
      binding.token,
    ),
  });
}

export function bindRepositoryDefaultBranch(
  port: RepositoryDefaultBranchPort,
  binding: RepositoryCredentialBinding,
): BoundRepositoryDefaultBranchPort {
  return Object.freeze<BoundRepositoryDefaultBranchPort>({
    getDefaultBranch: () => port.getDefaultBranch(binding.owner, binding.repository, binding.token),
  });
}

export function bindIssueCommentPublication(
  port: IssueCommentPublicationPort,
  binding: RepositoryCredentialBinding,
): BoundIssueCommentPublicationPort {
  return Object.freeze<BoundIssueCommentPublicationPort>({
    addComment: (issueNumber, comment) => port.addComment(binding.owner, binding.repository, issueNumber, comment, binding.token),
    updateComment: (issueNumber, commentId, comment) => port.updateComment(binding.owner, binding.repository, issueNumber, commentId, comment, binding.token),
    removeComment: (issueNumber, commentId) => port.removeComment(binding.owner, binding.repository, issueNumber, commentId, binding.token),
    listIssueComments: (issueNumber) => port.listIssueComments(binding.owner, binding.repository, issueNumber, binding.token),
  });
}

export function bindIssueReopen(
  port: Pick<IssueNotificationPort, 'openIssue'>,
  binding: RepositoryCredentialBinding,
): BoundIssueReopenPort {
  return Object.freeze<BoundIssueReopenPort>({
    openIssue: (issueNumber) => port.openIssue(binding.owner, binding.repository, issueNumber, binding.token),
  });
}

export function bindBranchListQuery(
  port: BranchListQueryPort,
  binding: RepositoryCredentialBinding,
): BoundBranchListQueryPort {
  return Object.freeze<BoundBranchListQueryPort>({
    getListOfBranches: () => port.getListOfBranches(binding.owner, binding.repository, binding.token),
  });
}

export function bindPullRequestBranchQuery(
  port: PullRequestBranchQueryPort,
  binding: RepositoryCredentialBinding,
): BoundPullRequestBranchQueryPort {
  return Object.freeze<BoundPullRequestBranchQueryPort>({
    getOpenPullRequestNumbersByHeadBranch: (branch) => port.getOpenPullRequestNumbersByHeadBranch(
      binding.owner,
      binding.repository,
      branch,
      binding.token,
    ),
  });
}

export function bindIssueProgress(
  port: IssueProgressPort,
  binding: RepositoryCredentialBinding,
): BoundIssueProgressPort {
  return Object.freeze<BoundIssueProgressPort>({
    setProgressLabel: (issueNumber, progress) => port.setProgressLabel(
      binding.owner,
      binding.repository,
      issueNumber,
      progress,
      binding.token,
    ),
  });
}

export function bindIssueInactivityQuery(
  port: IssueInactivityQueryPort,
  binding: RepositoryCredentialBinding,
): BoundIssueInactivityQueryPort {
  return Object.freeze<BoundIssueInactivityQueryPort>({
    listOpenIssuesByLabel: (label) => port.listOpenIssuesByLabel(binding.owner, binding.repository, label, binding.token),
    getOpenIssue: (issueNumber) => port.getOpenIssue(binding.owner, binding.repository, issueNumber, binding.token),
  });
}

export function bindBranchChangeSize(
  port: BranchChangeSizePort,
  binding: RepositoryCredentialBinding,
): BoundBranchChangeSizePort {
  return Object.freeze<BoundBranchChangeSizePort>({
    getSizeCategoryAndReason: (head, base, thresholds, labels) => port.getSizeCategoryAndReason(
      binding.owner,
      binding.repository,
      head,
      base,
      thresholds,
      labels,
      binding.token,
    ),
  });
}

export function bindBranchDependencies(
  port: BranchDependencyQueryPort,
  binding: RepositoryCredentialBinding,
): BoundBranchDependencyQueryPort {
  return Object.freeze<BoundBranchDependencyQueryPort>({
    listOpenDependencies: () => port.listOpenDependencies(binding.owner, binding.repository, binding.token),
    resolveTarget: (conversationNumber) => port.resolveTarget(binding.owner, binding.repository, conversationNumber, binding.token),
  });
}

export function bindBranchComparison(
  port: BranchSyncComparisonPort,
  binding: RepositoryCredentialBinding,
): BoundBranchSyncComparisonPort {
  return Object.freeze<BoundBranchSyncComparisonPort>({
    compare: (parentBranch, workingBranch) => port.compare(
      binding.owner,
      binding.repository,
      parentBranch,
      workingBranch,
      binding.token,
    ),
  });
}

export function bindBranchSyncWorkspace(
  port: BranchSyncWorkspacePort,
  binding: RepositoryCredentialBinding,
): BoundBranchSyncWorkspacePort {
  return Object.freeze<BoundBranchSyncWorkspacePort>({
    prepare: (parentBranch, workingBranch) => port.prepare(parentBranch, workingBranch, binding.token),
    validatePreparedMerge: (paths) => port.validatePreparedMerge(paths),
    assertRemoteHeadsUnchanged: (parentBranch, parentSha, workingBranch, childSha) => port.assertRemoteHeadsUnchanged(
      parentBranch,
      parentSha,
      workingBranch,
      childSha,
      binding.token,
    ),
    commitAndPush: (workingBranch, message, author) => port.commitAndPush(workingBranch, message, author, binding.token),
    abort: () => port.abort(),
  });
}

export function bindAuthenticatedUser(
  port: AuthenticatedUserPort,
  binding: RepositoryCredentialBinding,
): BoundAuthenticatedUserPort {
  return Object.freeze<BoundAuthenticatedUserPort>({
    getUser: () => port.getUserFromToken(binding.token),
    getUserDetails: () => port.getTokenUserDetails(binding.token),
  });
}

export function bindSetupWorkspace(port: SetupWorkspacePort, binding: RepositoryCredentialBinding): BoundSetupWorkspacePort {
  return Object.freeze<BoundSetupWorkspacePort>({
    prepare: (selection) => port.prepare(selection),
    hasValidToken: () => port.hasValidToken(binding.token),
  });
}

export function bindInitialLabels(
  port: InitialLabelProvisioningPort,
  binding: RepositoryCredentialBinding,
): BoundInitialLabelProvisioningPort {
  return Object.freeze<BoundInitialLabelProvisioningPort>({
    ensureInitialLabels: (labels) => port.ensureInitialLabels(binding.owner, binding.repository, labels, binding.token),
  });
}

export function bindIssueTypes(
  port: IssueTypeProvisioningPort,
  binding: RepositoryCredentialBinding,
): BoundIssueTypeProvisioningPort {
  return Object.freeze<BoundIssueTypeProvisioningPort>({
    ensureIssueTypes: (types) => port.ensureIssueTypes(binding.owner, types, binding.token),
  });
}

export function bindSetupVariables(
  port: SetupRepositoryVariablesCommandPort,
  binding: RepositoryCredentialBinding,
): BoundSetupRepositoryVariablesCommandPort {
  return Object.freeze<BoundSetupRepositoryVariablesCommandPort>({
    upsert: (variables) => port.upsert(binding.owner, binding.repository, binding.token, variables),
    ...(port.upsertScopedVariables ? {
      upsertScopedVariables: (target, variables) => port.upsertScopedVariables!(
        binding.owner,
        binding.repository,
        binding.token,
        target,
        variables,
      ),
    } : {}),
  });
}

export function bindSetupSecrets(
  port: SetupRepositorySecretsCommandPort,
  binding: RepositoryCredentialBinding,
): BoundSetupRepositorySecretsCommandPort {
  return Object.freeze<BoundSetupRepositorySecretsCommandPort>({
    upsertSecrets: (credentials) => port.upsertSecrets(binding.owner, binding.repository, binding.token, credentials),
    ...(port.upsertScopedSecrets ? {
      upsertScopedSecrets: (target, credentials) => port.upsertScopedSecrets!(
        binding.owner,
        binding.repository,
        binding.token,
        target,
        credentials,
      ),
    } : {}),
  });
}

export function bindSetupRemoteConfiguration(
  port: SetupRemoteConfigurationReadPort,
  binding: RepositoryCredentialBinding,
): BoundSetupRemoteConfigurationReadPort {
  return Object.freeze<BoundSetupRemoteConfigurationReadPort>({ inspect: () => port.inspect(binding.owner, binding.repository, binding.token) });
}

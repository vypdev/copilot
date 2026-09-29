import type { SetupQuestion } from '../../domain/setup_questionnaire';

export interface SetupQuestionDocumentation {
  readonly title: string;
  readonly url: string;
}

const docs = {
  features: { title: 'Copilot features and workflow triggers', url: 'https://docs.page/vypdev/copilot/features' },
  issueWorkflows: { title: 'Copilot issue workflow setup', url: 'https://docs.page/vypdev/copilot/issues/workflow-setup' },
  branchManagement: { title: 'Issue branch management', url: 'https://docs.page/vypdev/copilot/issues/branch-management' },
  preBranchSdd: { title: 'Pre-branch design documents', url: 'https://docs.page/vypdev/copilot/issues/pre-branch-sdds' },
  issueLifecycle: { title: 'Issue notifications and automatic closure', url: 'https://docs.page/vypdev/copilot/issues/notifications-and-auto-close' },
  assignments: { title: 'Assignees and GitHub Projects', url: 'https://docs.page/vypdev/copilot/issues/assignees-and-projects' },
  pullRequestWorkflows: { title: 'Pull-request workflow setup', url: 'https://docs.page/vypdev/copilot/pull-requests/workflow-setup' },
  pullRequestDescription: { title: 'AI pull-request descriptions', url: 'https://docs.page/vypdev/copilot/pull-requests/ai-description' },
  repositoryGuidance: { title: 'Repository guidance for agents', url: 'https://docs.page/vypdev/copilot/agents/repository-collaboration' },
  runtime: { title: 'Agent runtime selection', url: 'https://docs.page/vypdev/copilot/agents/runtime-selection' },
  model: { title: 'Agent model selection', url: 'https://docs.page/vypdev/copilot/agents/model-selection' },
  command: { title: 'Agent CLI configuration', url: 'https://docs.page/vypdev/copilot/agents/cli-configuration' },
  repository: { title: 'Copilot repository configuration', url: 'https://docs.page/vypdev/copilot/configuration' },
  deployment: { title: 'Release and hotfix orchestration', url: 'https://docs.page/vypdev/copilot/issues/deployment-orchestration' },
  bugbot: { title: 'Bugbot configuration', url: 'https://docs.page/vypdev/copilot/bugbot/configuration' },
  bugbotVerification: { title: 'Bugbot autofix verification commands', url: 'https://docs.page/vypdev/copilot/bugbot/verification-commands' },
  approval: { title: 'Guarded pull-request approval', url: 'https://docs.page/vypdev/copilot/pull-requests/guarded-approval' },
  githubStatusChecks: { title: 'GitHub: status checks and required checks', url: 'https://docs.github.com/en/pull-requests/reference/status-checks' },
  projects: { title: 'Assignees and GitHub Projects', url: 'https://docs.page/vypdev/copilot/issues/assignees-and-projects' },
  githubProjects: { title: 'GitHub: About Projects', url: 'https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects' },
  githubStatus: { title: 'GitHub: About single-select fields', url: 'https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-single-select-fields' },
  provisioning: { title: 'Copilot setup and provisioning', url: 'https://docs.page/vypdev/copilot/how-to-use' },
  storage: { title: 'GitHub Actions Secrets and Variables', url: 'https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets' },
} as const satisfies Record<string, SetupQuestionDocumentation>;

/** Links are selected from source-controlled constants, never derived from answers or remote text. */
export function setupQuestionDocumentation(question: Pick<SetupQuestion, 'id' | 'stateId'>): SetupQuestionDocumentation {
  const id = question.id;
  if (id === 'issueWorkflows.enabled') return docs.issueWorkflows;
  if (id === 'features.issues') return docs.issueWorkflows;
  if (id === 'features.pullRequests') return docs.pullRequestWorkflows;
  if (id === 'repository.issueManagedBranches' || /^repository\.(feature|bugfix|hotfix|release|docs|chore)Tree$/u.test(id)) return docs.branchManagement;
  if (id === 'repository.preBranchSdd') return docs.preBranchSdd;
  if (id === 'repository.inactivityThresholdHours' || id === 'features.inactiveIssueClosure') return docs.issueLifecycle;
  if (id === 'repository.desiredAssigneesCount' || id === 'repository.desiredReviewersCount') return docs.assignments;
  if (id === 'ai.pullRequestDescriptionMode') return docs.pullRequestDescription;
  if (id === 'ai.bugbotFixVerifyCommands') return docs.bugbotVerification;
  if (id === 'projects.ids') return docs.githubProjects;
  if (id === 'pullRequestApproval.testChecks') return docs.githubStatusChecks;
  if (/^projects\.(issue|pullRequest)(Created|InProgress)Column$/u.test(id) || id === 'projects.statusVerified') return docs.githubStatus;
  if (id.startsWith('repositoryAgentGuidance.')) return docs.repositoryGuidance;
  if (id.startsWith('agents.')) {
    if (id.endsWith('.provider')) return docs.runtime;
    if (id.endsWith('.executable')) return docs.command;
    return docs.model;
  }
  if (id === 'ai.provisioningMode') return docs.command;
  const byState = {
    capabilities: docs.features,
    'agent-runtime': docs.runtime,
    'agent-model-defaults': docs.model,
    'agent-role-overrides': docs.model,
    repository: docs.repository,
    deployment: docs.deployment,
    bugbot: docs.bugbot,
    'pull-request-approval': docs.approval,
    projects: docs.projects,
    provisioning: docs.provisioning,
    storage: docs.storage,
  } as const;
  return byState[question.stateId];
}

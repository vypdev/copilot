import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SetupQuestion } from '../../../domain/setup_questionnaire';
import { setupQuestionDocumentation } from '../setup_question_documentation_policy';

describe('setup question documentation', () => {
  test.each([
    ['features.issues', 'capabilities', '/issues/workflow-setup'],
    ['features.pullRequests', 'capabilities', '/pull-requests/workflow-setup'],
    ['issueWorkflows.enabled', 'capabilities', '/issues/workflow-setup'],
    ['repositoryAgentGuidance.enabled', 'capabilities', '/agents/repository-collaboration'],
    ['agents.planner.provider', 'agent-runtime', '/agents/runtime-selection'],
    ['agents.findings.executable', 'agent-model-defaults', '/agents/cli-configuration'],
    ['agents.findings.model', 'agent-model-defaults', '/agents/model-selection'],
    ['repository.mainBranch', 'repository', '/configuration'],
    ['repository.preBranchSdd', 'repository', '/issues/pre-branch-sdds'],
    ['repository.issueManagedBranches', 'repository', '/issues/branch-management'],
    ['repository.inactivityThresholdHours', 'repository', '/issues/notifications-and-auto-close'],
    ['repository.desiredAssigneesCount', 'repository', '/issues/assignees-and-projects'],
    ['repository.releaseReconciliationStrategy', 'deployment', '/issues/deployment-orchestration'],
    ['ai.bugbotSeverity', 'bugbot', '/bugbot/configuration'],
    ['ai.bugbotFixVerifyCommands', 'bugbot', '/bugbot/verification-commands'],
    ['ai.pullRequestDescriptionMode', 'bugbot', '/pull-requests/ai-description'],
    ['ai.provisioningMode', 'provisioning', '/agents/cli-configuration'],
    ['projects.enabled', 'projects', '/issues/assignees-and-projects'],
    ['manageRepositorySecrets', 'provisioning', '/how-to-use'],
  ])('%s has a related, locally documented destination', (id, stateId, path) => {
    const reference = setupQuestionDocumentation({ id, stateId: stateId as SetupQuestion['stateId'] });
    expect(reference.title.trim()).not.toBe('');
    expect(reference.url).toBe(`https://docs.page/vypdev/copilot${path}`);
    expect(existsSync(resolve(__dirname, '../../../../docs', `${path.slice(1)}.mdx`))).toBe(true);
  });

  test('storage questions point to the official GitHub Actions resource guide', () => {
    const reference = setupQuestionDocumentation({ id: 'storage.secrets.defaultScope', stateId: 'storage' });
    expect(reference.url).toBe('https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets');
  });

  test('trusted check selection links directly to the official status-check explanation', () => {
    expect(setupQuestionDocumentation({ id: 'pullRequestApproval.testChecks', stateId: 'pull-request-approval' }).url)
      .toBe('https://docs.github.com/en/pull-requests/reference/status-checks');
  });

  test('Project selection and Status options link to official GitHub explanations', () => {
    expect(setupQuestionDocumentation({ id: 'projects.ids', stateId: 'projects' }).url)
      .toBe('https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects');
    expect(setupQuestionDocumentation({ id: 'projects.issueCreatedColumn', stateId: 'projects' }).url)
      .toBe('https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-single-select-fields');
  });
});

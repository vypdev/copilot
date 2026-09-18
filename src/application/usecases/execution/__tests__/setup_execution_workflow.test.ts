import { createIssueWorkflowProfile } from '../../../../domain/issue_workflow_profile';
import type { SetupExecutionContext } from '../setup_execution_contracts';
import { runSetupExecution } from '../setup_execution_workflow';

function context(overrides: Partial<SetupExecutionContext> = {}): SetupExecutionContext {
  return {
    debug: false,
    local: false,
    tokenUser: 'copilot-bot',
    issueNumber: 42,
    eventName: 'issues',
    isSingleAction: false,
    isIssue: true,
    isPullRequest: false,
    isPush: false,
    issue: { number: 42, body: 'stale event body' },
    pullRequest: { number: -1, head: '', base: '' },
    commit: { branch: '' },
    singleAction: { issue: -1, currentAction: '', isIssue: false, isPullRequest: false, isPush: false },
    branches: {
      featureTree: 'feature', bugfixTree: 'bugfix', hotfixTree: 'hotfix', releaseTree: 'release', docsTree: 'docs', choreTree: 'chore',
    },
    labelNames: {
      feature: 'feature', enhancement: 'enhancement', bugfix: 'bugfix', bug: 'bug', hotfix: 'hotfix', release: 'release',
      docs: 'docs', documentation: 'documentation', chore: 'chore', maintenance: 'maintenance', question: 'question', help: 'help',
    },
    currentPullRequestLabels: [],
    release: { active: false },
    hotfix: { active: false },
    issueWorkflowProfile: createIssueWorkflowProfile(['feature']),
    ...overrides,
  };
}

function dependencies(labels: string[], body: string, previousConfiguration?: object) {
  return {
    issueSetupPort: {
      isPullRequest: jest.fn(),
      isIssue: jest.fn(),
      getHeadBranch: jest.fn(),
      getLabels: jest.fn(async () => labels),
      getDescription: jest.fn(async () => body),
    },
    organizationSetupPort: { getTokenUser: jest.fn() },
    configurationPort: { get: jest.fn(async () => previousConfiguration as never) },
    branchVersionResolver: { resolve: jest.fn(async (input) => ({ ...input, completed: true })) },
  };
}

describe('setup execution live issue admission', () => {
  it('uses live labels and body rather than the event payload', async () => {
    const liveBody = [
      '## Description of the idea or improvement\nAdd it',
      '## Current limitations or challenges\nMissing',
      '## Expected impact\nUseful',
    ].join('\n\n');
    const ports = dependencies(['feature'], liveBody);

    const result = await runSetupExecution(context(), ports);

    expect(ports.issueSetupPort.getLabels).toHaveBeenCalledWith(42);
    expect(ports.issueSetupPort.getDescription).toHaveBeenCalledWith(42);
    expect(result).toMatchObject({
      status: 'configured',
      branchType: 'feature',
      state: { liveIssueBody: liveBody, issueWorkflowAdmission: { status: 'eligible', kind: 'feature' } },
    });
  });

  it('classifies an issue-bound single action and blocks a disabled kind before routing', async () => {
    const ports = dependencies(['bug'], '## Description\nBad');
    const result = await runSetupExecution(context({
      isSingleAction: true,
      configuredSingleActionIssue: 42,
      singleAction: { issue: 42, currentAction: 'check_progress_action', isIssue: true, isPullRequest: false, isPush: false },
    }), ports);

    expect(result).toMatchObject({
      status: 'configured',
      branchType: '',
      state: { issueWorkflowAdmission: { status: 'disabled', kind: 'bugfix' } },
    });
    expect(ports.branchVersionResolver.resolve).not.toHaveBeenCalled();
  });

  it('fails admission when the live form body is incomplete even if the event body looked valid', async () => {
    const ports = dependencies(['feature'], '## Description of the idea or improvement\nOnly one field');
    const result = await runSetupExecution(context(), ports);

    expect(result).toMatchObject({
      status: 'configured',
      branchType: '',
      state: {
        issueWorkflowAdmission: {
          status: 'invalid',
          kind: 'feature',
          missingHeadings: ['Current limitations or challenges', 'Expected impact'],
        },
      },
    });
    expect(ports.branchVersionResolver.resolve).not.toHaveBeenCalled();
  });

  it('retains previous managed state for continuation decisions without guessing a current kind', async () => {
    const ports = dependencies([], '', { branchType: 'feature', workingBranch: 'feature/42-work' });
    const result = await runSetupExecution(context({ eventName: 'push', isIssue: false, isPush: true, commit: { branch: 'feature/42-work' } }), ports);

    expect(result).toMatchObject({
      state: {
        previousConfiguration: { branchType: 'feature', workingBranch: 'feature/42-work' },
        issueWorkflowAdmission: { status: 'unmanaged' },
      },
    });
  });
});

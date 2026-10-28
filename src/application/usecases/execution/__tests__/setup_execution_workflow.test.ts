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
      getTitle: jest.fn(async () => 'Current normalized title'),
    },
    organizationSetupPort: { getTokenUser: jest.fn() },
    configurationPort: { get: jest.fn(async () => previousConfiguration as never) },
    branchVersionResolver: { resolve: jest.fn(async (input) => ({ ...input, completed: true })) },
  };
}

describe('setup execution live issue admission', () => {
  it.each([
    { configuredSingleActionIssue: 1 },
    { isIssue: false, isPullRequest: true, pullRequest: { number: 7, head: 'feature/1-work', base: 'develop' } },
  ])('authenticates repository installation without loading incidental issue/PR metadata %j', async overrides => {
    const ports = dependencies(['bug'], 'incomplete old issue', { workingBranch: 'bugfix/1-old' });
    ports.organizationSetupPort.getTokenUser.mockResolvedValue('operator');
    const result = await runSetupExecution(context({ tokenUser: undefined, isSingleAction: true,
      ...overrides,
      singleAction: { issue: 1, currentAction: 'initial_setup', isIssue: true, isPullRequest: false, isPush: false },
    }), ports);
    expect(result).toMatchObject({ status: 'issue-unresolved', tokenUser: 'operator',
      issueResolution: { singleAction: { issue: 0, isIssue: false } } });
    expect(ports.organizationSetupPort.getTokenUser).toHaveBeenCalledTimes(1);
    expect(ports.issueSetupPort.getLabels).not.toHaveBeenCalled();
    expect(ports.issueSetupPort.getDescription).not.toHaveBeenCalled();
    expect(ports.configurationPort.get).not.toHaveBeenCalled();
    expect(ports.branchVersionResolver.resolve).not.toHaveBeenCalled();
  });
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
      state: { liveIssueBody: liveBody, liveIssueTitle: 'Current normalized title', issueWorkflowAdmission: { status: 'eligible', kind: 'feature' } },
    });
  });

  it('classifies an issue-bound single action and blocks a disabled kind before routing', async () => {
    const ports = dependencies(['bug'], '## Description\nBad');
    // The explicit target is a real issue; admission policy still rejects its disabled kind.
    ports.issueSetupPort.isPullRequest.mockResolvedValue(false);
    ports.issueSetupPort.isIssue.mockResolvedValue(true);
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


it('passes the mapped admitted live snapshot to the release resolver instead of the event body',async()=>{
  const profile=createIssueWorkflowProfile(['release'],{release:{'Release Type':'Bump','Release Version':'Product Version'}});
  const body='### Bump\nMinor\n### Product Version\nAutomatic\n### Changelog\nChanges\n### Additional Context\n_No response_';
  const ports=dependencies(['release'],body);await runSetupExecution(context({issueWorkflowProfile:profile}),ports);
  expect(ports.branchVersionResolver.resolve).toHaveBeenCalledWith(expect.objectContaining({body,issueWorkflowProfile:profile}));
});
it('never reaches version resolution when a mapped required release field is absent',async()=>{
  const profile=createIssueWorkflowProfile(['release'],{release:{'Release Version':'Product Version'}});const ports=dependencies(['release'],'### Release Version\n1.2.3');
  const result=await runSetupExecution(context({issueWorkflowProfile:profile}),ports);expect(result).toMatchObject({state:{issueWorkflowAdmission:{status:'invalid',missingHeadings:expect.arrayContaining(['Product Version'])}}});expect(ports.branchVersionResolver.resolve).not.toHaveBeenCalled();
});
it('admits a repaired consumer bug body on a fresh invocation',async()=>{
  const profile=createIssueWorkflowProfile(['bugfix'],{bugfix:{'copilot Version':'VaultStadio Version'}});const ports=dependencies(['bugfix'],'### Description\nFailure\n### Reproducing the issue\nSteps\n### VaultStadio Version\n1.2.3');
  expect(await runSetupExecution(context({issueWorkflowProfile:profile}),ports)).toMatchObject({status:'configured',branchType:'bugfix',state:{issueWorkflowAdmission:{status:'eligible',kind:'bugfix'}}});
});
it('keeps conflicting mapped workflow labels blocked before version resolution',async()=>{
  const ports=dependencies(['release','hotfix'],'### Product Version\n1.2.3');await runSetupExecution(context({issueWorkflowProfile:createIssueWorkflowProfile(['release','hotfix'],{release:{'Release Version':'Product Version'}})}),ports);expect(ports.branchVersionResolver.resolve).not.toHaveBeenCalled();
});
it('does not admit a fenced consumer field from an otherwise incomplete live bug body',async()=>{
  const ports=dependencies(['bugfix'],'### Description\nFailure\n### Reproducing the issue\nSteps\n```\n### VaultStadio Version\n1.2.3\n```');const profile=createIssueWorkflowProfile(['bugfix'],{bugfix:{'copilot Version':'VaultStadio Version'}});
  expect(await runSetupExecution(context({issueWorkflowProfile:profile}),ports)).toMatchObject({state:{issueWorkflowAdmission:{status:'invalid',missingHeadings:['VaultStadio Version']}}});
});

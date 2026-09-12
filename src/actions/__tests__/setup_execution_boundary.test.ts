import {
  applySetupExecutionResult,
  projectSetupExecutionContext,
  type SetupExecutionSource,
  type SetupExecutionTarget,
} from '../setup_execution_boundary';
import type {
  SetupExecutionResult,
  SetupExecutionState,
} from '../../application/usecases/execution/setup_execution_contracts';

function source(): SetupExecutionSource {
  return {
    debug: true,
    inputs: {
      'single-action-issue': '41',
      token: 'must-never-cross-the-boundary',
    },
    tokenUser: 'bot',
    issueNumber: 41,
    eventName: 'pull_request',
    isSingleAction: false,
    isIssue: false,
    isPullRequest: true,
    isPush: false,
    issue: { number: -1 },
    pullRequest: { number: 77, head: 'feature/41-work', base: 'develop' },
    commit: { branch: '' },
    singleAction: {
      issue: -1,
      currentSingleAction: '',
      isIssue: false,
      isPullRequest: false,
      isPush: false,
    },
    branches: {
      featureTree: 'feature',
      bugfixTree: 'bugfix',
      hotfixTree: 'hotfix',
      releaseTree: 'release',
      docsTree: 'docs',
      choreTree: 'chore',
    },
    labels: {
      feature: 'feature',
      enhancement: 'enhancement',
      bugfix: 'bugfix',
      bug: 'bug',
      hotfix: 'hotfix',
      release: 'release',
      docs: 'docs',
      documentation: 'documentation',
      chore: 'chore',
      maintenance: 'maintenance',
      currentPullRequestLabels: ['reviewed'],
    },
    release: { active: false },
    hotfix: { active: false },
  };
}

function target(): SetupExecutionTarget {
  return {
    tokenUser: undefined,
    issueNumber: -1,
    singleAction: { issue: -1, isIssue: false, isPullRequest: false, isPush: false },
    labels: { currentIssueLabels: ['old'], currentPullRequestLabels: ['old-pr'] },
    release: { active: false },
    hotfix: { active: false },
    previousConfiguration: undefined,
    currentConfiguration: {
      branchType: 'unchanged',
      deploymentOrchestration: undefined,
    },
  };
}

function configuredState(): SetupExecutionState {
  return {
    previousConfiguration: undefined,
    currentIssueLabels: ['release'],
    currentPullRequestLabels: ['reviewed'],
    release: { active: true, version: '2.0.0', branch: 'release/2.0.0' },
    hotfix: { active: false },
    configuration: {
      parentBranch: 'develop',
      releaseBranch: 'release/2.0.0',
    },
  };
}

const issueResolution = {
  issueNumber: 41,
  singleAction: { issue: 41, isIssue: true, isPullRequest: false, isPush: false },
} as const;

describe('setup execution boundary', () => {
  it('projects a deeply frozen copy without credentials or unrelated inputs', () => {
    const mutableSource = source();
    const context = projectSetupExecutionContext(mutableSource);

    (mutableSource.branches as { featureTree: string }).featureTree = 'changed';
    (mutableSource.labels.currentPullRequestLabels as string[]).push('changed');

    expect(context.branches.featureTree).toBe('feature');
    expect(context.currentPullRequestLabels).toEqual(['reviewed']);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.branches)).toBe(true);
    expect(Object.isFrozen(context.currentPullRequestLabels)).toBe(true);
    expect(context.configuredSingleActionIssue).toBe('41');
    expect(JSON.stringify(context)).not.toContain('must-never-cross-the-boundary');
    expect(context).not.toHaveProperty('inputs');
    expect(context).not.toHaveProperty('tokens');
  });

  it('applies only identity facts when issue resolution is incomplete', () => {
    const execution = target();
    const result: SetupExecutionResult = {
      status: 'issue-unresolved',
      tokenUser: 'bot',
      issueResolution,
    };

    applySetupExecutionResult(execution, result);

    expect(execution.tokenUser).toBe('bot');
    expect(execution.issueNumber).toBe(41);
    expect(execution.singleAction).toEqual(issueResolution.singleAction);
    expect(execution.labels.currentIssueLabels).toEqual(['old']);
    expect(execution.currentConfiguration.branchType).toBe('unchanged');
  });

  it('applies resolved setup state without completing branch type', () => {
    const execution = target();
    const result: SetupExecutionResult = {
      status: 'version-unresolved',
      tokenUser: 'bot',
      issueResolution,
      state: configuredState(),
    };

    applySetupExecutionResult(execution, result);

    expect(execution.release).toMatchObject({
      active: true,
      version: '2.0.0',
      branch: 'release/2.0.0',
    });
    expect(execution.currentConfiguration.releaseBranch).toBe('release/2.0.0');
    expect(execution.currentConfiguration.branchType).toBe('unchanged');
  });

  it('applies the branch type only for a completed setup result', () => {
    const execution = target();
    const state = configuredState();
    const result: SetupExecutionResult = {
      status: 'configured',
      tokenUser: 'bot',
      issueResolution,
      branchType: 'release',
      state,
    };

    applySetupExecutionResult(execution, result);
    (state.currentIssueLabels as string[]).push('late-mutation');

    expect(execution.currentConfiguration.branchType).toBe('release');
    expect(execution.labels.currentIssueLabels).toEqual(['release']);
  });
});

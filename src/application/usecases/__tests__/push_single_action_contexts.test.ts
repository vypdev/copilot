import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from '../../../domain/copilot_lifecycle';
import { DEFAULT_DEPLOYMENT_CONFIGURATION } from '../../../domain/deployment_configuration';
import type { DeploymentOrchestrationContext } from '../../ports/deployment_orchestration_ports';
import {
  projectAgentActivityContext,
  projectBranchObservationContext,
  projectBranchSyncContext,
  projectChangeSizeContext,
  projectCommitNotificationContext,
  projectDeploymentOrchestrationContext,
  projectDeploymentPublicationContext,
  projectInactivityContext,
  projectInitialSetupContext,
  projectIssueCommentActionContext,
  projectProgressContext,
  projectRecommendStepsContext,
  projectUserRequestContext,
  type PushSingleActionContextSource,
} from '../push_single_action_contexts';

const operation = {
  stateVersion: 1,
  revision: 1,
  operationId: 'operation-12345678',
  kind: 'release',
  version: '1.2.3',
  phase: 'publishing',
  title: 'Release',
  changelog: 'Changes',
  productionSha: 'a'.repeat(40),
  reconciliationTargets: [{ targetBranch: 'develop', sourceBranch: 'release/1.2.3', sourceSha: 'b'.repeat(40), mode: 'direct', status: 'pending' }],
} as never;

type DeepMutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

function source(): DeepMutable<PushSingleActionContextSource> {
  return {
    owner: 'owner',
    repo: 'repo',
    issueNumber: 42,
    eventName: 'push',
    tokenUser: 'copilot-bot',
    inputs: {
      action: 'opened',
      after: '0'.repeat(40),
      setupConfiguration: { features: { release: true } },
      setupCredentials: { workflowPat: { name: 'PAT', value: 'secret' }, apiKeys: [] },
      setupRemoteConfiguration: { ownerType: 'User', repositoryVisibility: 'private' },
      setupWorkflowUpdates: ['copilot.yml', 7],
    },
    commit: {
      branch: 'feature/42-contexts',
      commits: [{ id: 'abc', message: 'feat: context', author: { name: 'A', username: 'a' } }],
    },
    currentConfiguration: { parentBranch: 'develop', deploymentOrchestration: operation },
    previousConfiguration: {
      recommendationState: {
        issueDescriptionFingerprint: 'description',
        recommendationFingerprint: 'recommendation',
        recommendation: 'Do this',
      },
    },
    branches: {
      development: 'develop', featureTree: 'feature', bugfixTree: 'bugfix', docsTree: 'docs',
      choreTree: 'chore', hotfixTree: 'hotfix', releaseTree: 'release',
    },
    ai: {
      getAgentConfiguration: (task) => ({ provider: 'codex', model: `${task}-model` }),
      getAiIncludeReasoning: () => true,
      getBugbotFixVerifyCommands: () => ['pnpm test'],
    },
    singleAction: {
      operationId: 'operation-12345678', version: '1.2.3', issue: 42,
      message: 'Deployment failed.', commentId: 0, commentIdInput: '', commentMode: 'create',
    },
    inactivityThresholdHours: 168,
    labels: {
      branchManagementLauncherLabel: 'branch-management', bug: 'bug', bugfix: 'bugfix', hotfix: 'hotfix',
      enhancement: 'enhancement', feature: 'feature', release: 'release', question: 'question', help: 'help',
      deploy: 'deploy', deployed: 'deployed', docs: 'docs', documentation: 'documentation', chore: 'chore',
      maintenance: 'maintenance', priorityHigh: 'priority: high', priorityMedium: 'priority: medium',
      priorityLow: 'priority: low', priorityNone: 'priority: none', sizeXxl: 'size: XXL', sizeXl: 'size: XL',
      sizeL: 'size: L', sizeM: 'size: M', sizeS: 'size: S', sizeXs: 'size: XS',
      lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS,
      currentIssueLabels: ['feature', 'size: M'], currentPullRequestLabels: ['state:reviewing'],
      sizedLabelOnIssue: 'size: M', isRelease: false, isHotfix: false,
    },
    sizeThresholds: Object.fromEntries(
      ['xxl', 'xl', 'l', 'm', 's', 'xs'].map((key, index) => [key, { lines: 100 - index, files: 10, commits: 5 }]),
    ) as PushSingleActionContextSource['sizeThresholds'],
    project: { getProjects: () => [{
      id: 'project-1',
      title: 'Roadmap',
      type: 'organization',
      owner: 'owner',
      url: 'https://github.com/orgs/owner/projects/1',
      number: 1,
    }] },
    issue: { number: 42, reopenOnPush: true },
    pullRequest: { number: 99 },
    release: { active: false },
    hotfix: { active: false },
    images: {
      imagesOnCommit: true,
      commitAutomaticActions: ['automatic.gif'], commitFeatureGifs: ['feature.gif'],
      commitBugfixGifs: ['bugfix.gif'], commitReleaseGifs: ['release.gif'],
      commitHotfixGifs: ['hotfix.gif'], commitDocsGifs: ['docs.gif'], commitChoreGifs: ['chore.gif'],
    },
    isBugfix: false,
    isFeature: true,
    isDocs: false,
    isChore: false,
    commitPrefixBuilder: 'replace-slash',
    issueTypes: {} as never,
  };
}

describe('push and single-action context projection', () => {
  it('copies and freezes deployment publication state', () => {
    const input = source();
    const projected = projectDeploymentPublicationContext(input);
    (input.currentConfiguration.deploymentOrchestration!.reconciliationTargets as unknown as unknown[]).push({});

    expect(projected).toMatchObject({ requestedOperationId: 'operation-12345678', requestedVersion: '1.2.3' });
    expect(projected.operation?.reconciliationTargets).toHaveLength(1);
    expect(Object.isFrozen(projected.operation?.reconciliationTargets)).toBe(true);
  });

  it('omits absent deployment publication state', () => {
    const input = source();
    input.currentConfiguration.deploymentOrchestration = undefined;

    expect(projectDeploymentPublicationContext(input)).toEqual({
      requestedOperationId: 'operation-12345678',
      requestedVersion: '1.2.3',
    });
  });

  it('copies optional deployment receipts and failures with an empty reconciliation list', () => {
    const input = source();
    input.currentConfiguration.deploymentOrchestration = Object.assign({}, operation, {
      reconciliationTargets: undefined,
      publicationReceipt: { releaseId: 7 },
      lastFailure: { code: 'publication-failed' },
    }) as never;

    const projected = projectDeploymentPublicationContext(input);
    expect(projected.operation?.reconciliationTargets).toEqual([]);
    expect(Object.isFrozen(projected.operation?.publicationReceipt)).toBe(true);
    expect(Object.isFrozen(projected.operation?.lastFailure)).toBe(true);
  });

  it('projects progress without repository authority and isolates copied collections', () => {
    const input = source();
    const projected = projectProgressContext(input);
    input.branches.featureTree = 'mutated';

    expect(projected.branchTypes[0]).toBe('feature');
    expect(projected.agentConfiguration.model).toBe('findings-model');
    expect(JSON.stringify(projected)).not.toContain('secret');
    expect(Object.isFrozen(projected.branchTypes)).toBe(true);
  });

  it('uses the fixed progress branch fallback for an empty development branch', () => {
    const input = source();
    input.branches.development = '';

    expect(projectProgressContext(input).developmentBranch).toBe('develop');
  });

  it('projects recommendation event and previous state as frozen facts', () => {
    const projected = projectRecommendStepsContext(source());

    expect(projected).toMatchObject({ issueNumber: 42, eventAction: 'opened', tokenUser: 'copilot-bot' });
    expect(Object.isFrozen(projected.previousRecommendation)).toBe(true);
    expect(projected.agentConfiguration.model).toBe('planner-model');
  });

  it('omits absent optional recommendation identity, event, and prior state', () => {
    const input = source();
    delete input.tokenUser;
    delete input.previousConfiguration;
    delete input.inputs;

    expect(projectRecommendStepsContext(input)).toEqual({
      issueNumber: 42,
      eventName: 'push',
      eventAction: '',
      agentConfiguration: { provider: 'codex', model: 'planner-model' },
    });
  });

  it('projects inactivity labels and fixed threshold', () => {
    expect(projectInactivityContext(source())).toEqual({
      waitingLabels: ['state:awaiting-maintainer', 'state:awaiting-issue-author'],
      activityLabel: 'state:ai-processing',
      thresholdHours: 168,
      locale: 'en-US',
    });
  });

  it.each([
    ['0'.repeat(40), true],
    ['a'.repeat(40), false],
  ])('classifies branch deletion for after=%s', (after, deletedPush) => {
    const input = source();
    input.inputs = { ...input.inputs, after };

    expect(projectBranchObservationContext(input)).toMatchObject({
      pushedBranch: 'feature/42-contexts', deletedPush, trustedBotLogin: 'copilot-bot',
      repository: { owner: 'owner', name: 'repo' },
    });
  });

  it('omits absent branch-observation actor and classifies a missing after SHA as active', () => {
    const input = source();
    delete input.tokenUser;
    delete input.inputs;

    expect(projectBranchObservationContext(input)).toEqual({
      pushedBranch: 'feature/42-contexts',
      deletedPush: false,
      repository: { owner: 'owner', name: 'repo' },
      locale: 'en-US',
    });
  });

  it('projects a user request without exposing the repository token', () => {
    const projected = projectUserRequestContext(source());

    expect(projected).toMatchObject({ issueNumber: 42, headBranch: 'feature/42-contexts', baseBranch: 'develop' });
    expect(projected.agentConfiguration.model).toBe('fixer-model');
    expect('tokens' in projected).toBe(false);
  });

  it('preserves an explicit empty branch and uses the fallback only when both branch sources are absent', () => {
    const input = source();
    delete input.currentConfiguration.parentBranch;
    input.branches.development = '';

    expect(projectUserRequestContext(input).baseBranch).toBe('');
    expect(projectChangeSizeContext(input).baseBranch).toBe('');

    input.branches.development = undefined as never;
    expect(projectUserRequestContext(input).baseBranch).toBe('develop');
    expect(projectChangeSizeContext(input).baseBranch).toBe('develop');
  });

  it.each([
    [{ pullRequest: 99, issue: 42, fallback: 7 }, 99],
    [{ pullRequest: -1, issue: 42, fallback: 7 }, 42],
    [{ pullRequest: -1, issue: -1, fallback: 7 }, 7],
    [{ pullRequest: -1, issue: -1, fallback: -1 }, -1],
  ])('selects branch-sync conversation precedence %#', (numbers, expected) => {
    const input = source();
    input.pullRequest.number = numbers.pullRequest;
    input.issue.number = numbers.issue;
    input.issueNumber = numbers.fallback;
    const projected = projectBranchSyncContext(input);

    expect(projected.conversationNumber).toBe(expected);
    expect(Object.isFrozen(projected.verifyCommands)).toBe(true);
  });

  it.each([
    ['release', { release: true }],
    ['hotfix', { hotfix: true }],
    ['bugfix', { bugfix: true }],
    ['feature', { feature: true }],
    ['docs', { docs: true }],
    ['chore', { chore: true }],
    ['automatic', {}],
  ] as const)('projects %s commit presentation facts', (theme, flags) => {
    const input = source();
    input.release.active = Boolean('release' in flags && flags.release);
    input.hotfix.active = Boolean('hotfix' in flags && flags.hotfix);
    input.isBugfix = Boolean('bugfix' in flags && flags.bugfix);
    input.isFeature = Boolean('feature' in flags && flags.feature);
    input.isDocs = Boolean('docs' in flags && flags.docs);
    input.isChore = Boolean('chore' in flags && flags.chore);

    expect(projectCommitNotificationContext(input).theme).toBe(theme);
  });

  it('deep-copies commits, thresholds, labels, and project facts', () => {
    const input = source();
    const notification = projectCommitNotificationContext(input);
    const size = projectChangeSizeContext(input);
    input.commit.commits[0].message = 'mutated';
    input.sizeThresholds.xxl.lines = 0;

    expect(notification.commits[0].message).toBe('feat: context');
    expect(size.thresholds.xxl.lines).toBe(100);
    expect(size.labels).toEqual({ xxl: 'size: XXL', xl: 'size: XL', l: 'size: L', m: 'size: M', s: 'size: S', xs: 'size: XS' });
    expect(Object.isFrozen(size.projects)).toBe(true);
  });

  it('supports commits without author metadata and omits an absent current size', () => {
    const input = source();
    input.commit.commits = [{ id: 'abc', message: 'feat: context' }];
    delete input.labels.sizedLabelOnIssue;

    const notification = projectCommitNotificationContext(input);
    const size = projectChangeSizeContext(input);

    expect(notification.commits).toEqual([{ id: 'abc', message: 'feat: context' }]);
    expect(size).not.toHaveProperty('currentSize');
  });

  it('keeps setup input deep-frozen and omits unrelated label state', () => {
    const projected = projectInitialSetupContext(source());

    expect(projected.workflowUpdates).toEqual(['copilot.yml']);
    expect(Object.isFrozen(projected.setupCredentials)).toBe(true);
    expect('currentIssueLabels' in projected.labels).toBe(false);
    expect('isRelease' in projected.labels).toBe(false);
  });

  it('rejects non-object setup payloads and non-array workflow updates', () => {
    const input = source();
    input.inputs = {
      setupConfiguration: [],
      setupCredentials: null,
      setupRemoteConfiguration: 'invalid',
      setupWorkflowUpdates: 'invalid',
    };

    expect(projectInitialSetupContext(input)).toMatchObject({ workflowUpdates: [] });
    expect(projectInitialSetupContext(input)).not.toHaveProperty('setupConfiguration');
    expect(projectInitialSetupContext(input)).not.toHaveProperty('setupCredentials');
    expect(projectInitialSetupContext(input)).not.toHaveProperty('setupRemoteConfiguration');
  });

  it('projects a valid issue-comment command', () => {
    expect(projectIssueCommentActionContext(source())).toEqual({
      kind: 'ready', issueNumber: 42, request: { mode: 'create', message: 'Deployment failed.' },
    });
  });

  it('projects invalid issue-comment input as an explicit failure fact', () => {
    const input = source();
    input.singleAction.message = ' ';

    expect(projectIssueCommentActionContext(input)).toMatchObject({ kind: 'invalid' });
  });

  it.each([
    ['issues', 42, 'issue'],
    ['pull_request', 99, 'pull-request'],
    ['pull_request_review_comment', 99, 'pull-request'],
  ] as const)('projects %s activity target', (eventName, number, kind) => {
    const input = source();
    input.eventName = eventName;

    expect(projectAgentActivityContext(input).target).toMatchObject({ number, kind });
  });

  it('omits an invalid activity target', () => {
    const input = source();
    input.issue.number = -1;
    input.issueNumber = -1;

    expect(projectAgentActivityContext(input).target).toBeUndefined();
  });

  it('defaults missing activity label collections to an empty frozen list', () => {
    const input = source();
    input.eventName = 'pull_request';
    input.labels.currentPullRequestLabels = undefined as never;

    const projected = projectAgentActivityContext(input);
    expect(projected.target?.labels).toEqual([]);
    expect(Object.isFrozen(projected.target?.labels)).toBe(true);
  });

  it('removes deployment credentials and isolates mutable state from the route aggregate', () => {
    const raw = {
      owner: 'owner', repo: 'repo', tokens: { token: 'secret-token' },
      branches: { defaultBranch: 'master', development: 'develop', releaseTree: 'release', hotfixTree: 'hotfix' },
      workflows: { release: 'release.yml', hotfix: 'hotfix.yml' },
      locale: { issue: 'en', pullRequest: 'en' },
      labels: { isRelease: true, isHotfix: false, deploy: 'deploy', deployed: 'deployed', lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS },
      deployment: { ...DEFAULT_DEPLOYMENT_CONFIGURATION },
      singleAction: {
        issue: 42, version: '1.2.3', title: 'Release', changelog: 'Changes', operationId: 'operation-12345678',
        message: '', isPrepareDeploymentAction: true, isContinueDeploymentAction: false,
        isPublishedDeploymentAction: false, isFailedDeploymentAction: false,
      },
      pullRequest: { number: -1 },
      currentConfiguration: { branchType: 'release', releaseBranch: 'release/1.2.3', deploymentOrchestration: operation },
    } as unknown as DeploymentOrchestrationContext;
    const projected = projectDeploymentOrchestrationContext(raw);
    projected.currentConfiguration.releaseBranch = 'release/changed';
    const withoutOperation = projectDeploymentOrchestrationContext({
      ...raw,
      currentConfiguration: { ...raw.currentConfiguration, deploymentOrchestration: undefined },
    });

    expect('tokens' in projected).toBe(false);
    expect(raw.currentConfiguration.releaseBranch).toBe('release/1.2.3');
    expect(Object.isFrozen(projected.branches)).toBe(true);
    expect(withoutOperation.currentConfiguration.deploymentOrchestration).toBeUndefined();
  });
});

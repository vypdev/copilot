/**
 * Unit tests for Execution state plus characterization tests for setup orchestration.
 */

jest.mock('@actions/github', () => ({
  context: {
    eventName: 'workflow_dispatch',
    actor: 'test-actor',
    repo: { repo: 'test-repo', owner: 'test-owner' },
    payload: {},
  },
}));

jest.mock('../../../utils/logger', () => ({
  setGlobalLoggerDebug: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockGetUserFromToken = jest.fn();
const mockGetLabels = jest.fn();
const mockIsPullRequest = jest.fn();
const mockIsIssue = jest.fn();
const mockGetHeadBranch = jest.fn();
const mockConfigGet = jest.fn();
const mockGetLatestTag = jest.fn();
const mockGetReleaseVersionInvoke = jest.fn();
const mockGetReleaseTypeInvoke = jest.fn();
const mockGetHotfixVersionInvoke = jest.fn();

import { ACTIONS, INPUT_KEYS } from '../../../utils/constants';
import { Ai } from '../ai';
import { Branches } from '../branches';
import { Emoji } from '../emoji';
import type { LatestTagQueryPort } from '../../../application/ports/branch_tag_ports';
import { Execution } from '../execution';
import { Hotfix } from '../hotfix';
import { Images } from '../images';
import { Issue } from '../issue';
import { IssueTypes } from '../issue_types';
import { Labels } from '../labels';
import { Locale } from '../locale';
import { ProjectDetail } from '../project_detail';
import { Projects } from '../projects';
import { PullRequest } from '../pull_request';
import { Release } from '../release';
import { SingleAction } from '../single_action';
import { SizeThreshold } from '../size_threshold';
import { SizeThresholds } from '../size_thresholds';
import { Tokens } from '../tokens';
import { Workflows } from '../workflows';
import { ExecutionBranchVersionResolver } from '../../../application/usecases/execution/execution_branch_version_resolver';
import { SetupExecutionUseCase } from '../../../application/usecases/execution/setup_execution_use_case';

function makeLabels(): Labels {
  return new Labels(
    'launch',
    'bug',
    'bugfix',
    'hotfix',
    'enhancement',
    'feature',
    'release',
    'question',
    'help',
    'deploy',
    'deployed',
    'docs',
    'documentation',
    'chore',
    'maintenance',
    'high',
    'medium',
    'low',
    'none',
    'XXL',
    'XL',
    'L',
    'M',
    'S',
    'XS',
  );
}

function makeIssue(inputs?: Record<string, unknown>): Issue {
  return new Issue(false, false, 0, inputs as never);
}

function makePullRequest(inputs?: Record<string, unknown>): PullRequest {
  return new PullRequest(0, 0, 0, inputs as never);
}

function makeBranches(): Branches {
  return new Branches(
    'main',
    'main',
    'develop',
    'feature',
    'bugfix',
    'hotfix',
    'release',
    'docs',
    'chore',
  );
}

function makeImages(): Images {
  const empty: string[] = [];
  return new Images(
    false,
    false,
    false,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
  );
}

function makeIssueTypes(): IssueTypes {
  return new IssueTypes(
    'Task',
    'Task desc',
    'BLUE',
    'Bug',
    'Bug desc',
    'RED',
    'Feature',
    'Feature desc',
    'GREEN',
    'Docs',
    'Docs desc',
    'GREY',
    'Maintenance',
    'Maint desc',
    'GREY',
    'Hotfix',
    'Hotfix desc',
    'RED',
    'Release',
    'Release desc',
    'BLUE',
    'Question',
    'Q desc',
    'PURPLE',
    'Help',
    'Help desc',
    'PURPLE',
  );
}

function makeSizeThresholds(): SizeThresholds {
  return new SizeThresholds(
    new SizeThreshold(0, 0, 0),
    new SizeThreshold(0, 0, 0),
    new SizeThreshold(0, 0, 0),
    new SizeThreshold(0, 0, 0),
    new SizeThreshold(0, 0, 0),
    new SizeThreshold(0, 0, 0),
  );
}

function buildExecution(inputs?: Record<string, unknown>, overrides?: Partial<{
  singleAction: SingleAction;
  issue: Issue;
  pullRequest: PullRequest;
  labels: Labels;
  branches: Branches;
}>): Execution {
  const labels = overrides?.labels ?? makeLabels();
  const branches = overrides?.branches ?? makeBranches();
  return new Execution({
    debug: false,
    singleAction: overrides?.singleAction ?? new SingleAction('', '', '', '', ''),
    commitPrefixBuilder: 'prefix',
    issue: overrides?.issue ?? makeIssue(inputs),
    pullRequest: overrides?.pullRequest ?? makePullRequest(inputs),
    emoji: new Emoji(false, ''),
    images: makeImages(),
    tokens: new Tokens('token'),
    ai: new Ai('http://localhost', 'model', false, false, [], false, 'High', 10, []),
    labels,
    issueTypes: makeIssueTypes(),
    locale: new Locale('en', 'en'),
    sizeThresholds: makeSizeThresholds(),
    branches,
    release: new Release(),
    hotfix: new Hotfix(),
    workflows: new Workflows('release-wf', 'hotfix-wf'),
    projects: new Projects([new ProjectDetail({})], '', '', '', ''),
    inputs: inputs as never,
  });
}

const branchRepository = { getLatestTag: mockGetLatestTag } as unknown as LatestTagQueryPort;

const setupIssuePort = {
  getLabels: mockGetLabels,
  isPullRequest: mockIsPullRequest,
  isIssue: mockIsIssue,
  getHeadBranch: mockGetHeadBranch,
  getDescription: jest.fn(),
  updateDescription: jest.fn(),
};
const setupOrganizationPort = { getUserFromToken: mockGetUserFromToken };
const setupConfigurationPort = { get: mockConfigGet };

function setupExecution(execution: Execution): Promise<void> {
  const branchVersionResolver = new ExecutionBranchVersionResolver(
    branchRepository,
    { taskId: 'release-version', invoke: mockGetReleaseVersionInvoke },
    { taskId: 'release-type', invoke: mockGetReleaseTypeInvoke },
    { taskId: 'hotfix-version', invoke: mockGetHotfixVersionInvoke },
  );
  return new SetupExecutionUseCase(
    setupIssuePort,
    setupOrganizationPort,
    setupConfigurationPort,
    branchVersionResolver,
  ).invoke(execution);
}

describe('Execution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserFromToken.mockResolvedValue('token-user');
    mockGetLabels.mockResolvedValue([]);
    mockConfigGet.mockResolvedValue(undefined);
  });

  describe('getters (inputs override)', () => {
    it('eventName returns inputs.eventName when set', () => {
      const e = buildExecution({ eventName: 'issues' });
      expect(e.eventName).toBe('issues');
    });

    it('returns an empty event name when inputs are undefined', () => {
      const e = buildExecution(undefined);
      expect(e.eventName).toBe('');
    });

    it('actor returns inputs.actor when set', () => {
      const e = buildExecution({ actor: 'custom-actor' });
      expect(e.actor).toBe('custom-actor');
    });

    it('repo returns inputs.repo.repo when set', () => {
      const e = buildExecution({ repo: { repo: 'my-repo', owner: 'my-owner' } });
      expect(e.repo).toBe('my-repo');
    });

    it('owner returns inputs.repo.owner when set', () => {
      const e = buildExecution({ repo: { repo: 'my-repo', owner: 'my-owner' } });
      expect(e.owner).toBe('my-owner');
    });

    it('isSingleAction returns true when singleAction.enabledSingleAction is true', () => {
      const singleAction = new SingleAction('think', '', '', '', '');
      const e = buildExecution(undefined, { singleAction });
      expect(e.isSingleAction).toBe(true);
    });

    it('isIssue returns true when issue.isIssue is true', () => {
      const issue = makeIssue({ eventName: 'issues' });
      const e = buildExecution(undefined, { issue });
      expect(e.isIssue).toBe(true);
    });

    it('isIssue returns true when issue.isIssueComment is true', () => {
      const issue = makeIssue({ eventName: 'issue_comment' });
      const e = buildExecution(undefined, { issue });
      expect(e.isIssue).toBe(true);
    });

    it('isPullRequest returns true when pullRequest.isPullRequest is true', () => {
      const pullRequest = makePullRequest({ eventName: 'pull_request' });
      const e = buildExecution(undefined, { pullRequest });
      expect(e.isPullRequest).toBe(true);
    });

    it('isPush returns true when eventName is push', () => {
      const e = buildExecution({ eventName: 'push' });
      expect(e.isPush).toBe(true);
    });

    it('isPush returns false when eventName is not push', () => {
      const e = buildExecution({ eventName: 'issues' });
      expect(e.isPush).toBe(false);
    });

    it('isFeature returns true when issueType equals branches.featureTree', () => {
      const labels = makeLabels();
      labels.currentIssueLabels = ['feature'];
      const e = buildExecution(undefined, { labels });
      expect(e.issueType).toBe('feature');
      expect(e.isFeature).toBe(true);
    });

    it('isBugfix returns true when issueType equals branches.bugfixTree', () => {
      const labels = makeLabels();
      labels.currentIssueLabels = ['bugfix'];
      const e = buildExecution(undefined, { labels });
      expect(e.issueType).toBe('bugfix');
      expect(e.isBugfix).toBe(true);
    });

    it('isDocs returns true when issueType equals branches.docsTree', () => {
      const labels = makeLabels();
      labels.currentIssueLabels = ['docs'];
      const e = buildExecution(undefined, { labels });
      expect(e.issueType).toBe('docs');
      expect(e.isDocs).toBe(true);
    });

    it('isChore returns true when issueType equals branches.choreTree', () => {
      const labels = makeLabels();
      labels.currentIssueLabels = ['chore'];
      const e = buildExecution(undefined, { labels });
      expect(e.issueType).toBe('chore');
      expect(e.isChore).toBe(true);
    });

    it('isBranched returns true when labels contain branched label', () => {
      const labels = makeLabels();
      labels.currentIssueLabels = ['launch'];
      const e = buildExecution(undefined, { labels });
      expect(e.isBranched).toBe(true);
    });

    it('issueNotBranched returns true when isIssue and not isBranched', () => {
      const issue = makeIssue({ eventName: 'issues' });
      const labels = makeLabels();
      labels.currentIssueLabels = [];
      const e = buildExecution(undefined, { issue, labels });
      expect(e.issueNotBranched).toBe(true);
    });

    it('managementBranch returns feature tree when feature label present', () => {
      const labels = makeLabels();
      labels.currentIssueLabels = ['feature'];
      const e = buildExecution(undefined, { labels });
      expect(e.managementBranch).toBe('feature');
    });

    it('issueType returns feature when feature label present', () => {
      const labels = makeLabels();
      labels.currentIssueLabels = ['feature'];
      const e = buildExecution(undefined, { labels });
      expect(e.issueType).toBe('feature');
    });

    it('cleanIssueBranches returns true when previousConfig branchType differs from current', () => {
      const issue = makeIssue({ eventName: 'issues' } as never);
      const e = buildExecution({ eventName: 'issues' } as never, { issue });
      e.previousConfiguration = { branchType: 'feature' } as never;
      e.currentConfiguration.branchType = 'bugfix';
      expect(e.cleanIssueBranches).toBe(true);
    });

    it('commit returns Commit from inputs', () => {
      const e = buildExecution({
        commits: { ref: 'refs/heads/feature/123-foo' },
      } as never);
      const commit = e.commit;
      expect(commit.branch).toBe('feature/123-foo');
    });

    it('runnedByToken returns true when tokenUser equals actor', () => {
      const e = buildExecution({ actor: 'alice' });
      (e as unknown as { tokenUser: string }).tokenUser = 'alice';
      expect(e.runnedByToken).toBe(true);
    });

    it('runnedByToken returns false when tokenUser differs from actor', () => {
      const e = buildExecution({ actor: 'alice' });
      (e as unknown as { tokenUser: string }).tokenUser = 'bob';
      expect(e.runnedByToken).toBe(false);
    });
  });

  describe('constructor', () => {
    it('assigns all constructor arguments', () => {
      const singleAction = new SingleAction('think', '', '', '', '');
      const issue = makeIssue();
      const pullRequest = makePullRequest();
      const emoji = new Emoji(true, 'x');
      const tokens = new Tokens('t');
      const ai = new Ai('u', 'm', true, true, [], true, 'L', 5, []);
      const labels = makeLabels();
      const issueTypes = makeIssueTypes();
      const locale = new Locale('es', 'es');
      const sizeThresholds = makeSizeThresholds();
      const branches = makeBranches();
      const release = new Release();
      const hotfix = new Hotfix();
      const workflows = new Workflows('r', 'h');
      const project = new Projects([], 'a', 'b', 'c', 'd');

      const e = new Execution({
        debug: true,
        singleAction,
        commitPrefixBuilder: 'pre',
        issue,
        pullRequest,
        emoji,
        images: makeImages(),
        tokens,
        ai,
        labels,
        issueTypes,
        locale,
        sizeThresholds,
        branches,
        release,
        hotfix,
        workflows,
        projects: project,
        inputs: { eventName: 'push' },
      });

      expect(e.debug).toBe(true);
      expect(e.singleAction).toBe(singleAction);
      expect(e.commitPrefixBuilder).toBe('pre');
      expect(e.issue).toBe(issue);
      expect(e.pullRequest).toBe(pullRequest);
      expect(e.emoji).toBe(emoji);
      expect(e.tokens).toBe(tokens);
      expect(e.ai).toBe(ai);
      expect(e.labels).toBe(labels);
      expect(e.issueTypes).toBe(issueTypes);
      expect(e.locale).toBe(locale);
      expect(e.sizeThresholds).toBe(sizeThresholds);
      expect(e.branches).toBe(branches);
      expect(e.release).toBe(release);
      expect(e.hotfix).toBe(hotfix);
      expect(e.workflows).toBe(workflows);
      expect(e.project).toBe(project);
      expect(e.inputs).toEqual({ eventName: 'push' });
      expect(e.currentConfiguration).toBeDefined();
      expect(e.currentConfiguration.branchType).toBe('');
    });
  });

  describe('SetupExecutionUseCase', () => {
    it('sets tokenUser and throws if getUserFromToken returns null', async () => {
      mockGetUserFromToken.mockResolvedValue(null);
      const e = buildExecution(undefined, {});
      await expect(setupExecution(e)).rejects.toThrow('Failed to get user from token');
    });

    it('sets issueNumber from issue when isIssue and not single action', async () => {
      const issue = makeIssue({ eventName: 'issues', issue: { number: 99 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 99 } } as never, { issue });
      await setupExecution(e);
      expect(e.issueNumber).toBe(99);
    });

    it('queries stored configuration through the resolved semantic target', async () => {
      const issue = makeIssue({ eventName: 'issues', issue: { number: 99 } } as never);
      const e = buildExecution(
        { eventName: 'issues', repo: { owner: 'owner', repo: 'repository' }, issue: { number: 99 } } as never,
        { issue },
      );

      await setupExecution(e);

      expect(mockConfigGet).toHaveBeenCalledWith({
        owner: 'owner',
        repository: 'repository',
        issueNumber: 99,
        token: 'token',
      });
    });

    it('sets issueNumber from pullRequest head when isPullRequest and not single action', async () => {
      const pullRequest = makePullRequest({
        eventName: 'pull_request',
        repo: { owner: 'owner', repo: 'repository' },
        pull_request: { number: 314, head: { ref: 'feature/42-my-branch' } },
      } as never);
      const e = buildExecution({
        eventName: 'pull_request',
        repo: { owner: 'owner', repo: 'repository' },
        pull_request: { number: 314, head: { ref: 'feature/42-my-branch' } },
      } as never, { pullRequest });
      await setupExecution(e);
      expect(e.issueNumber).toBe(42);
      expect(mockConfigGet).toHaveBeenCalledWith({
        owner: 'owner',
        repository: 'repository',
        issueNumber: 314,
        token: 'token',
      });
    });

    it('sets issueNumber from commit branch when isPush and not single action', async () => {
      const e = buildExecution(
        { eventName: 'push', commits: { ref: 'refs/heads/feature/7-bar' } } as never,
        {},
      );
      await setupExecution(e);
      expect(e.issueNumber).toBe(7);
      expect(mockConfigGet).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 7 }));
    });

    it('sets currentIssueLabels from issue repository', async () => {
      mockGetLabels.mockResolvedValue(['feature', 'size-m']);
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.labels.currentIssueLabels).toEqual(['feature', 'size-m']);
    });

    it('sets release.active from labels.isRelease', async () => {
      mockGetLabels.mockResolvedValue(['release']);
      mockGetReleaseVersionInvoke.mockResolvedValue([
        { executed: true, success: true, payload: { releaseVersion: '1.0.0' } },
      ]);
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.release.active).toBe(true);
    });

    it('sets hotfix.active from labels.isHotfix', async () => {
      mockGetLabels.mockResolvedValue(['hotfix']);
      mockGetHotfixVersionInvoke.mockResolvedValue([
        { executed: true, success: true, payload: { baseVersion: '1.0.0', hotfixVersion: '1.0.1' } },
      ]);
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.hotfix.active).toBe(true);
    });

    it('single action with INPUT SINGLE_ACTION_ISSUE sets issueNumber', async () => {
      const singleAction = new SingleAction('check_progress', '0', '', '', '');
      const e = buildExecution(
        { [INPUT_KEYS.SINGLE_ACTION_ISSUE]: '123' } as never,
        { singleAction },
      );
      await setupExecution(e);
      expect(e.issueNumber).toBe(123);
      expect(e.singleAction.issue).toBe(123);
      expect(mockConfigGet).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 123 }));
    });

    it('rejects malformed configured issue numbers before querying GitHub', async () => {
      const singleAction = new SingleAction('check_progress', '0', '', '', '');
      const e = buildExecution(
        { [INPUT_KEYS.SINGLE_ACTION_ISSUE]: '123abc' },
        { singleAction },
      );

      await setupExecution(e);

      expect(e.issueNumber).toBe(-1);
      expect(mockIsIssue).not.toHaveBeenCalled();
      expect(mockIsPullRequest).not.toHaveBeenCalled();
      expect(mockConfigGet).not.toHaveBeenCalled();
      expect(mockGetLabels).not.toHaveBeenCalled();
    });

    it('does not query GitHub for a single action that has no issue', async () => {
      const e = buildExecution(undefined, { singleAction: new SingleAction(ACTIONS.THINK, '0', '', '', '') });

      await setupExecution(e);

      expect(e.issueNumber).toBe(-1);
      expect(mockIsIssue).not.toHaveBeenCalled();
      expect(mockIsPullRequest).not.toHaveBeenCalled();
      expect(mockConfigGet).not.toHaveBeenCalled();
      expect(mockGetLabels).not.toHaveBeenCalled();
    });

    it('single action isIssue path sets issueNumber from issue.number', async () => {
      const singleAction = new SingleAction('check_progress', '0', '', '', '');
      const issue = makeIssue({ eventName: 'issues', issue: { number: 88 } } as never);
      const e = buildExecution(undefined, { singleAction, issue });
      await setupExecution(e);
      expect(e.issueNumber).toBe(88);
      expect(e.singleAction.issue).toBe(88);
    });

    it('single action isPullRequest path sets issueNumber from head branch', async () => {
      const singleAction = new SingleAction('check_progress', '0', '', '', '');
      const pullRequest = makePullRequest({
        eventName: 'pull_request',
        pull_request: { head: { ref: 'bugfix/33-fix' } },
      } as never);
      const e = buildExecution(undefined, { singleAction, pullRequest });
      await setupExecution(e);
      expect(e.issueNumber).toBe(33);
    });

    it('single action isPush path sets issueNumber from commit branch', async () => {
      const singleAction = new SingleAction('check_progress', '0', '', '', '');
      const e = buildExecution(
        {
          eventName: 'push',
          commits: { ref: 'refs/heads/feature/11-baz' },
        } as never,
        { singleAction },
      );
      await setupExecution(e);
      expect(e.issueNumber).toBe(11);
    });

    it('single action else path: isPullRequest sets issueNumber from getHeadBranch', async () => {
      const singleAction = new SingleAction('check_progress', '999', '', '', '');
      mockIsPullRequest.mockResolvedValue(true);
      mockIsIssue.mockResolvedValue(false);
      mockGetHeadBranch.mockResolvedValue('feature/55-head');
      const e = buildExecution(undefined, { singleAction });
      await setupExecution(e);
      expect(e.issueNumber).toBe(55);
    });

    it('single action else path: getHeadBranch undefined returns early', async () => {
      const singleAction = new SingleAction('check_progress', '999', '', '', '');
      mockIsPullRequest.mockResolvedValue(true);
      mockIsIssue.mockResolvedValue(false);
      mockGetHeadBranch.mockResolvedValue(undefined);
      const e = buildExecution(undefined, { singleAction });
      await setupExecution(e);
      expect(e.issueNumber).toBe(-1);
      expect(mockGetLabels).not.toHaveBeenCalled();
      expect(mockConfigGet).not.toHaveBeenCalled();
      expect(mockGetReleaseVersionInvoke).not.toHaveBeenCalled();
      expect(mockGetHotfixVersionInvoke).not.toHaveBeenCalled();
    });

    it('restores previousConfiguration release branch and version', async () => {
      mockGetLabels.mockResolvedValue(['release']);
      mockConfigGet.mockResolvedValue({
        releaseBranch: 'release/1.2.3',
        parentBranch: 'develop',
      });
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.release.version).toBe('1.2.3');
      expect(e.release.branch).toBe('release/1.2.3');
      expect(e.currentConfiguration.parentBranch).toBe('develop');
      expect(e.currentConfiguration.releaseBranch).toBe('release/1.2.3');
    });

    it('restores previousConfiguration hotfix branches', async () => {
      mockGetLabels.mockResolvedValue(['hotfix']);
      mockConfigGet.mockResolvedValue({
        hotfixOriginBranch: 'tags/v1.0.0',
        hotfixBranch: 'hotfix/1.0.1',
      });
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.hotfix.baseVersion).toBe('1.0.0');
      expect(e.hotfix.baseBranch).toBe('tags/v1.0.0');
      expect(e.hotfix.version).toBe('1.0.1');
      expect(e.hotfix.branch).toBe('hotfix/1.0.1');
      expect(e.currentConfiguration.hotfixOriginBranch).toBe('tags/v1.0.0');
      expect(e.currentConfiguration.hotfixBranch).toBe('hotfix/1.0.1');
    });

    it('isPullRequest path fetches PR labels and sets release/hotfix from base', async () => {
      mockGetLabels.mockResolvedValue([]);
      const pullRequest = makePullRequest({
        eventName: 'pull_request',
        pull_request: { base: { ref: 'release/2.0.0' }, head: { ref: 'feature/10-x' } },
      } as never);
      const e = buildExecution(undefined, { pullRequest });
      await setupExecution(e);
      expect(e.release.active).toBe(true);
      expect(e.hotfix.active).toBe(false);
      expect(e.labels.currentPullRequestLabels).toEqual([]);
    });

    it('isPullRequest path sets hotfix.active when base contains hotfix tree', async () => {
      mockGetLabels.mockResolvedValue([]);
      const pullRequest = makePullRequest({
        eventName: 'pull_request',
        pull_request: { base: { ref: 'hotfix/1.0.1' }, head: { ref: 'feature/10-x' } },
      } as never);
      const e = buildExecution(undefined, { pullRequest });
      await setupExecution(e);
      expect(e.hotfix.active).toBe(true);
    });

    it('sets currentConfiguration.branchType from issueType', async () => {
      mockGetLabels.mockResolvedValue(['feature']);
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.currentConfiguration.branchType).toBe('feature');
    });

    it('single action else path: isIssue sets issueNumber from singleAction.issue', async () => {
      const singleAction = new SingleAction('check_progress', '77', '', '', '');
      mockIsPullRequest.mockResolvedValue(false);
      mockIsIssue.mockResolvedValue(true);
      const e = buildExecution(undefined, { singleAction });
      await setupExecution(e);
      expect(e.issueNumber).toBe(77);
    });

    it('sets parentBranch from previousConfiguration when current parentBranch undefined', async () => {
      mockGetLabels.mockResolvedValue(['release']);
      mockConfigGet.mockResolvedValue({ parentBranch: 'develop' });
      mockGetReleaseVersionInvoke.mockResolvedValue([
        { executed: true, success: true, payload: { releaseVersion: '2.0.0' } },
      ]);
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.currentConfiguration.parentBranch).toBe('develop');
    });

    it('release version from GetReleaseTypeUseCase and getLatestTag when GetReleaseVersion fails', async () => {
      mockGetLabels.mockResolvedValue(['release']);
      mockConfigGet.mockResolvedValue(undefined);
      mockGetReleaseVersionInvoke.mockResolvedValue([
        { executed: true, success: false },
      ]);
      mockGetReleaseTypeInvoke.mockResolvedValue([
        { executed: true, success: true, payload: { releaseType: 'Minor' } },
      ]);
      mockGetLatestTag.mockResolvedValue('1.0.0');
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.release.version).toBeDefined();
      expect(e.release.branch).toBe('release/1.1.0');
    });

    it('hotfix version from getLatestTag when GetHotfixVersionUseCase fails', async () => {
      mockGetLabels.mockResolvedValue(['hotfix']);
      mockConfigGet.mockResolvedValue(undefined);
      mockGetHotfixVersionInvoke.mockResolvedValue([
        { executed: true, success: false },
      ]);
      mockGetLatestTag.mockResolvedValue('1.0.0');
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.hotfix.baseVersion).toBe('1.0.0');
      expect(e.hotfix.version).toBeDefined();
      expect(e.hotfix.branch).toBe('hotfix/1.0.1');
    });

    it('setup returns early when release type from GetReleaseTypeUseCase is undefined', async () => {
      mockGetLabels.mockResolvedValue(['release']);
      mockConfigGet.mockResolvedValue(undefined);
      mockGetReleaseVersionInvoke.mockResolvedValue([{ executed: true, success: false }]);
      mockGetReleaseTypeInvoke.mockResolvedValue([
        { executed: true, success: true, payload: { releaseType: undefined } },
      ]);
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.release.version).toBeUndefined();
      expect(e.release.branch).toBeUndefined();
    });

    it('setup uses default base version 1.0.0 when getLatestTag returns undefined in release path', async () => {
      mockGetLabels.mockResolvedValue(['release']);
      mockConfigGet.mockResolvedValue(undefined);
      mockGetReleaseVersionInvoke.mockResolvedValue([{ executed: true, success: false }]);
      mockGetReleaseTypeInvoke.mockResolvedValue([
        { executed: true, success: true, payload: { releaseType: 'Minor' } },
      ]);
      mockGetLatestTag.mockResolvedValue(undefined);
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.release.version).toBe('1.1.0');
      expect(e.release.branch).toBe('release/1.1.0');
    });

    it('setup uses default 1.0.0 for Major release type when no tags exist (release 2.0.0)', async () => {
      mockGetLabels.mockResolvedValue(['release']);
      mockConfigGet.mockResolvedValue(undefined);
      mockGetReleaseVersionInvoke.mockResolvedValue([{ executed: true, success: false }]);
      mockGetReleaseTypeInvoke.mockResolvedValue([
        { executed: true, success: true, payload: { releaseType: 'Major' } },
      ]);
      mockGetLatestTag.mockResolvedValue(undefined);
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.release.version).toBe('2.0.0');
      expect(e.release.branch).toBe('release/2.0.0');
    });

    it('setup uses default base version 1.0.0 when getLatestTag returns undefined in hotfix path', async () => {
      mockGetLabels.mockResolvedValue(['hotfix']);
      mockConfigGet.mockResolvedValue(undefined);
      mockGetHotfixVersionInvoke.mockResolvedValue([{ executed: true, success: false }]);
      mockGetLatestTag.mockResolvedValue(undefined);
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      await setupExecution(e);
      expect(e.hotfix.baseVersion).toBe('1.0.0');
      expect(e.hotfix.version).toBe('1.0.1');
      expect(e.hotfix.branch).toBe('hotfix/1.0.1');
    });
    it('setup skips internal label fetch error when ACTION is INITIAL_SETUP', async () => {
      const singleAction = new SingleAction(ACTIONS.INITIAL_SETUP, '1', '', '', '');
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { singleAction, issue });
      mockGetLabels.mockRejectedValue(new Error('Label error'));
      await setupExecution(e);
      expect(e.labels.currentIssueLabels).toEqual([]);
    });

    it('setup throws when getLabels fails and not INITIAL_SETUP', async () => {
      const issue = makeIssue({ eventName: 'issues', issue: { number: 1 } } as never);
      const e = buildExecution({ eventName: 'issues', issue: { number: 1 } } as never, { issue });
      mockGetLabels.mockRejectedValue(new Error('Fatal label error'));
      await expect(setupExecution(e)).rejects.toThrow('Fatal label error');
    });
  });
});

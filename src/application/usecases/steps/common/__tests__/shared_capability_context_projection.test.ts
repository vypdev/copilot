import { Result } from '../../../../../data/model/result';
import { Ai } from '../../../../../data/model/ai';
import { projectCommentAutomationContext } from '../../../comment_automation_context';
import { projectCheckPermissionsContext } from '../check_permissions_workflow';
import { projectIssueCommentLanguageRequest } from '../../issue_comment/check_issue_comment_language_use_case';
import { projectPullRequestCommentLanguageRequest } from '../../pull_request_review_comment/check_pull_request_comment_language_use_case';
import { projectThinkContext } from '../think_workflow';
import { projectUpdateTitleContext } from '../update_title_workflow';
import {
  projectIssueContentLinkContext,
  projectPullRequestContentLinkContext,
} from '../project_content_link_workflow';
import { projectPublishResultContext } from '../publish_resume_workflow';
import { projectConfigurationPersistenceContext } from '../store_configuration_use_case';

const configuration = {
  provider: 'codex' as const,
  modelProvider: 'openai',
  model: 'gpt-5.6-luna',
  effort: 'low',
};

const labelFacts = {
  isHotfix: false,
  isRelease: false,
  isBugfix: false,
  isBug: false,
  isFeature: true,
  isEnhancement: false,
  isDocs: false,
  isDocumentation: false,
  isChore: false,
  isMaintenance: false,
  isHelp: false,
  isQuestion: false,
  containsBranchedLabel: true,
};

function expectDataOnly(value: unknown): void {
  const visit = (entry: unknown, key = ''): void => {
    expect(typeof entry).not.toBe('function');
    expect(['token', 'tokens', 'credential', 'credentials']).not.toContain(key.toLowerCase());
    if (Array.isArray(entry)) {
      entry.forEach((item) => visit(item));
    } else if (entry && typeof entry === 'object') {
      Object.entries(entry).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(value);
  expect(JSON.stringify(value)).not.toContain('secret-value');
}

function images() {
  return {
    imagesOnIssue: true,
    issueAutomaticActions: ['issue.gif'],
    issueFeatureGifs: [],
    issueBugfixGifs: [],
    issueReleaseGifs: [],
    issueHotfixGifs: [],
    issueDocsGifs: [],
    issueChoreGifs: [],
    imagesOnPullRequest: true,
    pullRequestAutomaticActions: ['pull-request.gif'],
    pullRequestFeatureGifs: [],
    pullRequestBugfixGifs: [],
    pullRequestReleaseGifs: [],
    pullRequestHotfixGifs: [],
    pullRequestDocsGifs: [],
    pullRequestChoreGifs: [],
  };
}

describe('P2-D shared capability context projections', () => {
  it('projects immutable issue permission facts without repository authority', () => {
    const labels = ['feature'];
    const context = projectCheckPermissionsContext({
      isIssue: true,
      issue: { opened: true, creator: 'alice' },
      pullRequest: { opened: false, creator: '' },
      labels: { isMandatoryBranchedLabel: true, currentIssueLabels: labels },
      tokens: { token: 'secret-value' },
    } as never);

    labels[0] = 'release';
    expect(context.currentLabels).toEqual(['feature']);
    expect(Object.isFrozen(context.currentLabels)).toBe(true);
    expectDataOnly(context);
  });

  it('projects issue and pull-request translation requests with route parity and copied agent selections', () => {
    const selected = { ...configuration };
    const issue = projectIssueCommentLanguageRequest({
      issue: { commentBody: 'hola', number: 7, commentId: 70 },
      locale: { issue: 'en' },
      ai: { getAgentConfiguration: () => selected },
      tokens: { token: 'secret-value' },
    } as never);
    const pullRequest = projectPullRequestCommentLanguageRequest({
      pullRequest: { commentBody: 'bonjour', number: 8, commentId: 80 },
      locale: { pullRequest: 'es' },
      ai: { getAgentConfiguration: () => ({ ...configuration }) },
      tokens: { token: 'secret-value' },
    } as never);

    selected.model = 'mutated';
    expect(issue).toMatchObject({ issueNumber: 7, commentId: 70, locale: 'en' });
    expect(issue.configuration?.model).toBe('gpt-5.6-luna');
    expect(Object.isFrozen(issue.configuration)).toBe(true);
    expect(pullRequest).toMatchObject({ commentBody: 'bonjour', issueNumber: 8, commentId: 80, locale: 'es' });
    expectDataOnly(issue);
    expectDataOnly(pullRequest);
  });

  it('selects and freezes the Think specialist without retaining the Ai method bag', () => {
    const selected = { ...configuration };
    const context = projectThinkContext({
      issueNumber: 9,
      tokenUser: 'copilot-bot',
      issue: { commentBody: '@copilot-bot plan this', isIssueComment: true, number: 9 },
      pullRequest: { commentBody: '', isPullRequestReviewComment: false, number: -1 },
      ai: { getAgentConfiguration: () => selected },
      tokens: { token: 'secret-value' },
    } as never);

    selected.effort = 'high';
    expect(context).toMatchObject({ request: { kind: 'ready', destinationNumber: 9 }, agentTask: 'planner' });
    expect('agentConfiguration' in context && context.agentConfiguration.effort).toBe('low');
    expectDataOnly(context);
  });

  it('projects one immutable data-only comment orchestration context at the route boundary', () => {
    const ai = new Ai('', 'gpt-5.6-luna', false, ['vendor/**'], false, 'low', 20, ['pnpm test']);
    const language = {
      commentBody: '@copilot-bot plan this',
      locale: 'en-US',
      issueNumber: 9,
      commentId: 90,
      configuration: { ...configuration },
    };
    const source = {
      owner: 'acme',
      repo: 'demo',
      actor: 'alice',
      issueNumber: 9,
      isIssue: true,
      isPullRequest: false,
      isPush: false,
      eventName: 'issue_comment',
      tokenUser: 'copilot-bot',
      issue: { number: 9, commentBody: '@copilot-bot plan this', isIssueComment: true },
      pullRequest: {
        number: -1,
        head: '',
        action: '',
        commentBody: '',
        isPullRequestReviewComment: false,
      },
      commit: { branch: 'feature/9' },
      currentConfiguration: { parentBranch: 'develop', results: [] },
      branches: { development: 'develop' },
      inputs: { action: 'created' },
      labels: { currentIssueLabels: ['feature'], currentPullRequestLabels: [] },
      locale: { pullRequest: 'en-US' },
      ai,
      tokens: { token: 'secret-value' },
    };
    const context = projectCommentAutomationContext(source as never, language, language.commentBody);
    const contextWithoutAgentSelection = projectCommentAutomationContext(
      source as never,
      { ...language, configuration: undefined },
      language.commentBody,
    );

    language.configuration.model = 'mutated';
    expect(context).toMatchObject({
      actor: 'alice',
      userComment: '@copilot-bot plan this',
      language: { issueNumber: 9, configuration: { model: 'gpt-5.6-luna' } },
      think: { request: { kind: 'ready' } },
      status: { target: 'issue' },
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(contextWithoutAgentSelection.language.configuration).toBeUndefined();
    expectDataOnly(context);
  });

  it('projects equivalent issue and pull-request title facts as discriminated records', () => {
    const source = {
      issueNumber: 10,
      issue: { number: 10, title: 'Issue', branchManagementAlways: true },
      pullRequest: { number: 11, title: 'Pull request' },
      emoji: { emojiLabeledTitle: true, branchManagementEmoji: '🌿' },
      release: { active: false },
      hotfix: { active: false },
      labels: labelFacts,
      tokens: { token: 'secret-value' },
    };
    const issue = projectUpdateTitleContext({ ...source, isIssue: true, isPullRequest: false } as never);
    const pullRequest = projectUpdateTitleContext({ ...source, isIssue: false, isPullRequest: true } as never);

    expect(issue).toMatchObject({ kind: 'issue', issueNumber: 10 });
    expect(pullRequest).toMatchObject({ kind: 'pull-request', issueNumber: 10, pullRequestNumber: 11 });
    expectDataOnly(issue);
    expectDataOnly(pullRequest);
  });

  it('copies project references for both issue and pull-request linking', () => {
    const projects = [{
      id: 'PVT_1',
      title: 'Delivery',
      type: 'organization',
      owner: 'acme',
      url: 'https://github.com/orgs/acme/projects/1',
      number: 1,
    }];
    const source = {
      issue: { number: 12 },
      pullRequest: { number: 13, id: 'PR_13' },
      project: {
        getProjects: () => projects,
        getProjectColumnIssueCreated: () => 'Todo',
        getProjectColumnPullRequestCreated: () => 'Review',
      },
      tokens: { token: 'secret-value' },
    };
    const issue = projectIssueContentLinkContext(source as never);
    const pullRequest = projectPullRequestContentLinkContext(source as never);

    projects[0].title = 'Mutated';
    expect(issue.projects[0].title).toBe('Delivery');
    expect(pullRequest).toMatchObject({ contentType: 'pull request', contentId: 'PR_13', columnName: 'Review' });
    expect(Object.isFrozen(issue.projects[0])).toBe(true);
    expectDataOnly(issue);
    expectDataOnly(pullRequest);
  });

  it('snapshots result publication data and semantic errors without retaining credentials', () => {
    const results = [new Result({ id: 'step', success: true, executed: true, steps: ['Done'] })];
    const publicationImages = images();
    const context = projectPublishResultContext({
      debug: false,
      isSingleAction: false,
      isIssue: true,
      isPullRequest: false,
      isPush: false,
      issueNumber: 14,
      issueNotBranched: false,
      isBugfix: false,
      isFeature: false,
      isDocs: false,
      isChore: false,
      singleAction: { issue: -1 },
      issue: { number: 14 },
      pullRequest: { number: -1 },
      release: { active: false },
      hotfix: { active: false },
      images: publicationImages,
      currentConfiguration: { results },
      tokens: { token: 'secret-value' },
    } as never);

    results[0].steps[0] = 'Mutated';
    publicationImages.issueAutomaticActions[0] = 'mutated.gif';
    expect(context.results[0].steps).toEqual(['Done']);
    expect(context.presentation.images.issueAutomaticActions).toEqual(['issue.gif']);
    expectDataOnly(context);
  });

  it('resolves and deeply freezes the configuration persistence target before storage', () => {
    const branchConfiguration = { rules: [{ branch: 'develop' }] };
    const context = projectConfigurationPersistenceContext({
      isSingleAction: false,
      isIssue: false,
      isPullRequest: true,
      isPush: false,
      issueNumber: -1,
      issue: { number: -1 },
      pullRequest: { number: 15 },
      singleAction: { issue: -1 },
      currentConfiguration: {
        branchType: 'feature',
        parentBranch: 'develop',
        branchConfiguration,
      },
      tokens: { token: 'secret-value' },
    } as never);

    branchConfiguration.rules[0].branch = 'main';
    expect(context).toMatchObject({ issueNumber: 15 });
    expect(context?.currentConfiguration.branchConfiguration).toEqual({ rules: [{ branch: 'develop' }] });
    expect(Object.isFrozen(context?.currentConfiguration.branchConfiguration)).toBe(true);
    expectDataOnly(context);
  });
});

import { Result } from '../../../data/model/result';
import {
  branchPreparationOutcome,
  projectIssueWorkflowStepContexts,
} from '../issue_workflow_context';
import {
  projectPullRequestDescriptionContext,
  projectPullRequestWorkflowStepContexts,
} from '../pull_request_workflow_context';

const agentConfiguration = {
  provider: 'codex' as const,
  modelProvider: 'openai',
  model: 'gpt-5.6-luna',
  effort: 'low',
};

function issueSource() {
  const projects = [{
    id: 'PVT_1', title: 'Delivery', type: 'organization', owner: 'acme',
    url: '', publicUrl: 'https://github.com/orgs/acme/projects/1', number: 1,
  }];
  return {
    owner: 'acme', repo: 'demo', issueNumber: 42, isIssue: true, isPullRequest: false,
    eventName: 'issues', tokenUser: 'copilot-bot', managementBranch: 'feature',
    issue: {
      number: 42, title: 'Ship context boundary', body: 'Body', creator: 'alice',
      opened: true, labeled: true, labelAdded: 'deploy', desiredAssigneesCount: 10,
    },
    pullRequest: { number: -1, creator: '', desiredAssigneesCount: 0 },
    labels: {
      isMandatoryBranchedLabel: false, isQuestion: false, isHelp: false,
      isHotfix: false, isRelease: false, isDocs: false, isDocumentation: false,
      isChore: false, isMaintenance: false, isBugfix: false, isBug: false,
      isFeature: true, isEnhancement: false, priorityLabelOnIssue: 'priority: high',
      priorityLabelOnIssueProcessable: true, priorityHigh: 'priority: high',
      priorityMedium: 'priority: medium', priorityLow: 'priority: low',
      feature: 'feature', bugfix: 'bugfix', deploy: 'deploy',
    },
    issueTypes: issueTypes(),
    branches: {
      main: 'main', defaultBranch: 'main', development: 'develop', featureTree: 'feature',
      bugfixTree: 'bugfix', docsTree: 'docs', choreTree: 'chore', hotfixTree: 'hotfix',
    },
    previousConfiguration: { branchType: 'bugfix' },
    currentConfiguration: { parentBranch: 'develop' },
    release: { active: false }, hotfix: { active: false },
    commitPrefixBuilder: '', workflows: { release: 'release.yml', hotfix: 'hotfix.yml' },
    project: { getProjects: () => projects, getProjectColumnIssueInProgress: () => 'In progress' },
    ai: { getAgentConfiguration: () => agentConfiguration },
    inputs: { action: 'opened' }, tokens: { token: 'secret-value' },
    projects,
  };
}

function pullRequestSource() {
  const base = issueSource();
  return {
    isIssue: false, isPullRequest: true, eventName: 'pull_request', issueNumber: 42,
    issue: { number: 42, creator: 'alice', desiredAssigneesCount: 1 },
    pullRequest: {
      number: 84, body: 'Human body', head: 'feature/42-context', base: 'develop',
      creator: 'bob', desiredAssigneesCount: 1, desiredReviewersCount: 15,
    },
    branches: { defaultBranch: 'main' },
    labels: {
      sizeLabels: ['size: S', 'size: M'], priorityLabelOnIssue: 'priority: medium',
      priorityLabelOnIssueProcessable: true, priorityHigh: 'priority: high',
      priorityMedium: 'priority: medium', priorityLow: 'priority: low',
    },
    project: base.project,
    ai: {
      getPullRequestDescriptionMode: () => 'append' as const,
      getAiMembersOnly: () => true,
      getAgentConfiguration: () => agentConfiguration,
    },
    tokens: { token: 'secret-value' },
  };
}

describe('P2-E issue and pull-request context projections', () => {
  it('projects immutable issue step requests without credential authority', () => {
    const source = issueSource();
    const contexts = projectIssueWorkflowStepContexts(source as never);

    expect(contexts.assignment).toEqual({
      target: 'issue', number: 42, desiredAssigneesCount: 10, creator: 'alice',
    });
    expect(contexts.prepareBranches.repositoryWebUrl).toBe('https://github.com/acme/demo');
    expect(contexts.issueType.issueType).toEqual({ name: 'Feature', description: 'Feature issue', color: 'GREEN' });
    expect(contexts.answerHelp).toMatchObject({ newIssue: true, issueNumber: 42 });
    expectDataOnly(contexts);
    expect(Object.isFrozen(contexts)).toBe(true);
    expect(Object.isFrozen(contexts.prepareBranches.branches.managedTypes)).toBe(true);
  });

  it('copies nested arrays, projects and agent configuration once', () => {
    const source = issueSource();
    const contexts = projectIssueWorkflowStepContexts(source as never);
    source.projects[0].title = 'Mutated';
    source.labels.priorityLabelOnIssue = 'priority: low';
    agentConfiguration.model = 'mutated';

    expect(contexts.priority.projects[0].title).toBe('Delivery');
    expect(contexts.priority.priority.currentLabel).toBe('priority: high');
    expect(contexts.answerHelp.agentConfiguration.model).toBe('gpt-5.6-luna');
    agentConfiguration.model = 'gpt-5.6-luna';
  });

  it('normalizes absent optional issue text and falls back to the canonical project URL', () => {
    const source = issueSource();
    Object.assign(source.issue, { title: undefined, body: undefined });
    source.projects[0].publicUrl = '';
    source.projects[0].url = 'https://github.com/orgs/acme/projects/1';

    const contexts = projectIssueWorkflowStepContexts(source as never);

    expect(contexts.prepareBranches.issueTitle).toBe('');
    expect(contexts.removeObsoleteBranches.issueTitle).toBe('');
    expect(contexts.answerHelp.description).toBe('');
    expect(contexts.priority.projects[0].url).toBe('https://github.com/orgs/acme/projects/1');
  });

  it.each([
    ['hotfix', { isHotfix: true }],
    ['release', { isRelease: true }],
    ['documentation', { isDocs: true }],
    ['maintenance', { isChore: true }],
    ['bug', { isBug: true }],
    ['help', { isHelp: true }],
    ['question', { isQuestion: true }],
    ['task', { isFeature: false }],
  ] as const)('selects the %s issue type from route facts', (expected, flags) => {
    const source = issueSource();
    Object.assign(source.labels, {
      isHotfix: false, isRelease: false, isDocs: false, isDocumentation: false,
      isChore: false, isMaintenance: false, isBugfix: false, isBug: false,
      isFeature: false, isEnhancement: false, isHelp: false, isQuestion: false,
      ...flags,
    });
    expect(projectIssueWorkflowStepContexts(source as never).issueType.issueType.name.toLowerCase()).toBe(expected);
  });

  it('projects distinct immutable PR requests and preserves configured maxima', () => {
    const source = pullRequestSource();
    const contexts = projectPullRequestWorkflowStepContexts(source);
    source.labels.sizeLabels[0] = 'mutated';

    expect(contexts.reviewers).toEqual({ pullRequestNumber: 84, desiredReviewersCount: 15, creator: 'bob' });
    expect(contexts.assignment).toEqual({
      target: 'pull request', number: 84, desiredAssigneesCount: 1, creator: 'bob',
    });
    expect(contexts.linkIssue).toMatchObject({ issueNumber: 42, originalBaseBranch: 'develop', defaultBranch: 'main' });
    expect(contexts.syncLabels.sizeLabels).toEqual(['size: S', 'size: M']);
    expect(contexts.description).toMatchObject({ mode: 'append', membersOnly: true });
    expectDataOnly(contexts);
  });

  it('uses the issue conversation number for explicit PR descriptions when the event has no PR payload number', () => {
    const source = pullRequestSource();
    source.eventName = 'issue_comment';
    source.pullRequest.number = -1;
    expect(projectPullRequestDescriptionContext(source).pullRequest.number).toBe(42);
  });

  it('freezes branch outcomes and copies both results and patches', () => {
    const input = [new Result({ id: 'branch', success: true })];
    const patch = { parentBranch: 'develop' };
    const outcome = branchPreparationOutcome(input, patch);
    input.push(new Result({ id: 'late' }));
    patch.parentBranch = 'mutated';
    expect(outcome.results).toHaveLength(1);
    expect(outcome.configurationPatch.parentBranch).toBe('develop');
    expect(Object.isFrozen(outcome.results)).toBe(true);
    expect(Object.isFrozen(outcome.configurationPatch)).toBe(true);
  });
});

function issueTypes(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of ['task', 'bug', 'feature', 'documentation', 'maintenance', 'hotfix', 'release', 'question', 'help']) {
    values[name] = name[0].toUpperCase() + name.slice(1);
    values[`${name}Description`] = `${values[name]} issue`;
    values[`${name}Color`] = name === 'feature' ? 'GREEN' : 'BLUE';
  }
  return values;
}

function expectDataOnly(value: unknown): void {
  const visit = (entry: unknown, key = ''): void => {
    expect(typeof entry).not.toBe('function');
    expect(['token', 'tokens', 'credential', 'credentials']).not.toContain(key.toLowerCase());
    if (Array.isArray(entry)) entry.forEach((item) => visit(item));
    else if (entry && typeof entry === 'object') Object.entries(entry).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(value);
  expect(JSON.stringify(value)).not.toContain('secret-value');
}

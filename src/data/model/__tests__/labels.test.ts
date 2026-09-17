import { Labels } from '../labels';

function createLabels(overrides: Partial<Record<keyof Labels, string>> = {}): Labels {
  const base = {
    bug: 'bug',
    bugfix: 'bugfix',
    hotfix: 'hotfix',
    enhancement: 'enhancement',
    feature: 'feature',
    release: 'release',
    question: 'question',
    help: 'help',
    deploy: 'deploy',
    deployed: 'deployed',
    docs: 'docs',
    documentation: 'documentation',
    chore: 'chore',
    maintenance: 'maintenance',
    sizeXxl: 'size/xxl',
    sizeXl: 'size/xl',
    sizeL: 'size/l',
    sizeM: 'size/m',
    sizeS: 'size/s',
    sizeXs: 'size/xs',
    priorityHigh: 'priority/high',
    priorityMedium: 'priority/medium',
    priorityLow: 'priority/low',
    priorityNone: 'priority/none',
  };
  const l = new Labels(
    base.bug,
    base.bugfix,
    base.hotfix,
    base.enhancement,
    base.feature,
    base.release,
    base.question,
    base.help,
    base.deploy,
    base.deployed,
    base.docs,
    base.documentation,
    base.chore,
    base.maintenance,
    base.priorityHigh,
    base.priorityMedium,
    base.priorityLow,
    base.priorityNone,
    base.sizeXxl,
    base.sizeXl,
    base.sizeL,
    base.sizeM,
    base.sizeS,
    base.sizeXs
  );
  Object.assign(l, overrides);
  return l;
}

describe('Labels', () => {
  it('isMandatoryBranchedLabel is true when isHotfix or isRelease', () => {
    const l = createLabels();
    l.currentIssueLabels = [];
    expect(l.isMandatoryBranchedLabel).toBe(false);
    l.currentIssueLabels = [l.hotfix];
    expect(l.isMandatoryBranchedLabel).toBe(true);
    l.currentIssueLabels = [l.release];
    expect(l.isMandatoryBranchedLabel).toBe(true);
  });

  it('containsBranchedLabel reflects the fixed branch readiness label', () => {
    const l = createLabels();
    l.currentIssueLabels = [];
    expect(l.containsBranchedLabel).toBe(false);
    l.currentIssueLabels = ['branched'];
    expect(l.containsBranchedLabel).toBe(true);
  });

  it('isDeploy and isDeployed from currentIssueLabels', () => {
    const l = createLabels();
    l.currentIssueLabels = [l.deploy];
    expect(l.isDeploy).toBe(true);
    expect(l.isDeployed).toBe(false);
    l.currentIssueLabels = [l.deployed];
    expect(l.isDeploy).toBe(false);
    expect(l.isDeployed).toBe(true);
  });

  it('isHelp and isQuestion from currentIssueLabels', () => {
    const l = createLabels();
    l.currentIssueLabels = [l.help];
    expect(l.isHelp).toBe(true);
    expect(l.isQuestion).toBe(false);
    l.currentIssueLabels = [l.question];
    expect(l.isQuestion).toBe(true);
  });

  it('isFeature, isEnhancement, isBugfix, isBug, isHotfix, isRelease', () => {
    const l = createLabels();
    l.currentIssueLabels = [l.feature];
    expect(l.isFeature).toBe(true);
    l.currentIssueLabels = [l.enhancement];
    expect(l.isEnhancement).toBe(true);
    l.currentIssueLabels = [l.bugfix];
    expect(l.isBugfix).toBe(true);
    l.currentIssueLabels = [l.bug];
    expect(l.isBug).toBe(true);
    l.currentIssueLabels = [l.hotfix];
    expect(l.isHotfix).toBe(true);
    l.currentIssueLabels = [l.release];
    expect(l.isRelease).toBe(true);
  });

  it('isDocs, isDocumentation, isChore, isMaintenance', () => {
    const l = createLabels();
    l.currentIssueLabels = [l.docs];
    expect(l.isDocs).toBe(true);
    l.currentIssueLabels = [l.documentation];
    expect(l.isDocumentation).toBe(true);
    l.currentIssueLabels = [l.chore];
    expect(l.isChore).toBe(true);
    l.currentIssueLabels = [l.maintenance];
    expect(l.isMaintenance).toBe(true);
  });

  it('sizedLabelOnIssue returns first matching size label', () => {
    const l = createLabels();
    l.currentIssueLabels = [l.sizeM];
    expect(l.sizedLabelOnIssue).toBe(l.sizeM);
    l.currentIssueLabels = [l.sizeXxl, l.sizeM];
    expect(l.sizedLabelOnIssue).toBe(l.sizeXxl);
    l.currentIssueLabels = [];
    expect(l.sizedLabelOnIssue).toBeUndefined();
  });

  it('sizedLabelOnIssue returns each size tier when only that label is present', () => {
    const l = createLabels();
    l.currentIssueLabels = [l.sizeXxl];
    expect(l.sizedLabelOnIssue).toBe(l.sizeXxl);
    l.currentIssueLabels = [l.sizeXl];
    expect(l.sizedLabelOnIssue).toBe(l.sizeXl);
    l.currentIssueLabels = [l.sizeL];
    expect(l.sizedLabelOnIssue).toBe(l.sizeL);
    l.currentIssueLabels = [l.sizeS];
    expect(l.sizedLabelOnIssue).toBe(l.sizeS);
    l.currentIssueLabels = [l.sizeXs];
    expect(l.sizedLabelOnIssue).toBe(l.sizeXs);
  });

  it('sizedLabelOnPullRequest returns first matching size label', () => {
    const l = createLabels();
    l.currentPullRequestLabels = [l.sizeS];
    expect(l.sizedLabelOnPullRequest).toBe(l.sizeS);
    l.currentPullRequestLabels = [];
    expect(l.sizedLabelOnPullRequest).toBeUndefined();
  });

  it('sizedLabelOnPullRequest returns each size tier when only that label is present', () => {
    const l = createLabels();
    l.currentPullRequestLabels = [l.sizeXxl];
    expect(l.sizedLabelOnPullRequest).toBe(l.sizeXxl);
    l.currentPullRequestLabels = [l.sizeXl];
    expect(l.sizedLabelOnPullRequest).toBe(l.sizeXl);
    l.currentPullRequestLabels = [l.sizeL];
    expect(l.sizedLabelOnPullRequest).toBe(l.sizeL);
    l.currentPullRequestLabels = [l.sizeM];
    expect(l.sizedLabelOnPullRequest).toBe(l.sizeM);
    l.currentPullRequestLabels = [l.sizeXs];
    expect(l.sizedLabelOnPullRequest).toBe(l.sizeXs);
  });

  it('isIssueSized and isPullRequestSized', () => {
    const l = createLabels();
    l.currentIssueLabels = [];
    l.currentPullRequestLabels = [];
    expect(l.isIssueSized).toBe(false);
    expect(l.isPullRequestSized).toBe(false);
    l.currentIssueLabels = [l.sizeM];
    expect(l.isIssueSized).toBe(true);
    l.currentPullRequestLabels = [l.sizeL];
    expect(l.isPullRequestSized).toBe(true);
  });

  it('sizeLabels and priorityLabels return arrays', () => {
    const l = createLabels();
    expect(l.sizeLabels).toEqual([l.sizeXxl, l.sizeXl, l.sizeL, l.sizeM, l.sizeS, l.sizeXs]);
    expect(l.priorityLabels).toEqual([l.priorityHigh, l.priorityMedium, l.priorityLow, l.priorityNone]);
  });

  it('priorityLabelOnIssue and priorityLabelOnPullRequest', () => {
    const l = createLabels();
    l.currentIssueLabels = [l.priorityHigh];
    l.currentPullRequestLabels = [l.priorityLow];
    expect(l.priorityLabelOnIssue).toBe(l.priorityHigh);
    expect(l.priorityLabelOnPullRequest).toBe(l.priorityLow);
    l.currentIssueLabels = [];
    expect(l.priorityLabelOnIssue).toBeUndefined();
  });

  it('priorityLabelOnIssue returns each priority when only that label is present', () => {
    const l = createLabels();
    l.currentIssueLabels = [l.priorityHigh];
    expect(l.priorityLabelOnIssue).toBe(l.priorityHigh);
    l.currentIssueLabels = [l.priorityMedium];
    expect(l.priorityLabelOnIssue).toBe(l.priorityMedium);
    l.currentIssueLabels = [l.priorityLow];
    expect(l.priorityLabelOnIssue).toBe(l.priorityLow);
    l.currentIssueLabels = [l.priorityNone];
    expect(l.priorityLabelOnIssue).toBe(l.priorityNone);
  });

  it('priorityLabelOnPullRequest returns each priority when only that label is present', () => {
    const l = createLabels();
    l.currentPullRequestLabels = [l.priorityHigh];
    expect(l.priorityLabelOnPullRequest).toBe(l.priorityHigh);
    l.currentPullRequestLabels = [l.priorityMedium];
    expect(l.priorityLabelOnPullRequest).toBe(l.priorityMedium);
    l.currentPullRequestLabels = [l.priorityLow];
    expect(l.priorityLabelOnPullRequest).toBe(l.priorityLow);
    l.currentPullRequestLabels = [l.priorityNone];
    expect(l.priorityLabelOnPullRequest).toBe(l.priorityNone);
    l.currentPullRequestLabels = [];
    expect(l.priorityLabelOnPullRequest).toBeUndefined();
  });

  it('priorityLabelOnIssueProcessable and priorityLabelOnPullRequestProcessable', () => {
    const l = createLabels();
    l.currentIssueLabels = [l.priorityNone];
    expect(l.priorityLabelOnIssueProcessable).toBe(false);
    l.currentIssueLabels = [l.priorityHigh];
    expect(l.priorityLabelOnIssueProcessable).toBe(true);
    l.currentPullRequestLabels = [l.priorityMedium];
    expect(l.priorityLabelOnPullRequestProcessable).toBe(true);
    l.currentPullRequestLabels = [l.priorityLow];
    expect(l.priorityLabelOnPullRequestProcessable).toBe(true);
  });

  it('isIssuePrioritized and isPullRequestPrioritized', () => {
    const l = createLabels();
    l.currentIssueLabels = [l.priorityHigh];
    expect(l.isIssuePrioritized).toBe(true);
    l.currentIssueLabels = [l.priorityNone];
    expect(l.isIssuePrioritized).toBe(false);
    l.currentPullRequestLabels = [l.priorityLow];
    expect(l.isPullRequestPrioritized).toBe(true);
  });
});

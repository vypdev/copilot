import { dependencyFromPullRequest, resolveOpenBranchDependencies } from '../branch_dependency_policy';
import type { GithubBranchSyncIssueNode as Issue, GithubBranchSyncPullRequestNode as Pr } from '../../../../infrastructure/github/ports/github_branch_sync_protocol';
const repo = { nameWithOwner: 'org/repo' };
const pageInfo = { hasNextPage: false };
const configured = (value: unknown = { schemaVersion: 3, parentBranch: 'develop', workingBranch: 'bugfix/79-runtime' }) =>
  `<!-- copilot-configuration-start\n${JSON.stringify(value)}\ncopilot-configuration-end -->`;
const issue = (change: Partial<Issue> = {}): Issue => ({ number: 79, linkedBranches: { nodes: [], pageInfo }, ...change });
const pr = (change: Partial<Pr> = {}): Pr => ({ number: 81, baseRefName: 'develop', headRefName: 'bugfix/80-input',
  headRepository: repo, closingIssuesReferences: { nodes: [{ number: 79, repository: repo }], pageInfo }, ...change });
const resolve = (issues: Issue[], prs: Pr[]) => resolveOpenBranchDependencies(issues, prs, 'org/repo');
const current = { issueNumber: 79, parentBranch: 'develop', workingBranch: 'bugfix/79-runtime' };

describe('branch dependency authority (#723)', () => {
  it('does not adopt contextual branches over the admitted issue79 relationship', () => {
    expect(resolve([issue({body:configured()})], [
      pr({body:'Keep #79 disabled; closes #80', closingIssuesReferences:{nodes:[{number:80,repository:repo}],pageInfo}}),
      pr({number:82,baseRefName:'master',headRefName:'chore/other',body:'Depends on #79'}),
    ])).toEqual([current]);
  });
  it('keeps release parent and working identity despite a native relationship to another PR', () => {
    expect(resolve([issue({number:170,body:configured({schemaVersion:3,parentBranch:'develop',workingBranch:'release/1.5.2'})})],
      [pr({baseRefName:'master',closingIssuesReferences:{nodes:[{number:170,repository:repo}],pageInfo}})]))
      .toEqual([{issueNumber:170,parentBranch:'develop',workingBranch:'release/1.5.2'}]);
  });
  it('deduplicates native evidence matching the configured relationship', () => {
    expect(resolve([issue({body:configured()})],[pr({headRefName:current.workingBranch})])).toEqual([current]);
  });
  it('never interprets ordinary #N mentions as a relationship', () => {
    expect(resolve([issue()], [pr({body:'Depends on #79',closingIssuesReferences:{nodes:[],pageInfo}})])).toEqual([]);
  });
  it('does not emulate closing keywords that GitHub did not link', () => {
    expect(resolve([issue()], [pr({body:'Closes #79',closingIssuesReferences:{nodes:[],pageInfo}})])).toEqual([]);
  });
  it('retains an unambiguous native closing link without textual mentions', () => {
    expect(resolve([issue()], [pr({body:'No textual issue reference'})])).toEqual([{...current,workingBranch:'bugfix/80-input'}]);
    expect(resolveOpenBranchDependencies([issue()], [pr()], 'ORG/REPO')).toHaveLength(1);
  });
  it('retains an explicitly linked repository branch with an open PR', () => {
    expect(resolve([issue({linkedBranches:{nodes:[null,{ref:null},{ref:{name:'refs/heads/feature/one',repository:repo}}],pageInfo}})],
      [pr({headRefName:'feature/one',closingIssuesReferences:{nodes:[null],pageInfo}})]))
      .toEqual([{...current,workingBranch:'feature/one'}]);
  });
  it('allows fallback for an admitted but not yet branched configuration', () => {
    expect(resolve([issue({body:configured({schemaVersion:3,branchType:'bugfix'})})],[pr()])).toHaveLength(1);
  });
  it('does not promote weaker links over malformed, partial, old or duplicate configuration', () => {
    for (const body of ['<!-- copilot-configuration-start\nnot-json\ncopilot-configuration-end -->',
      configured({schemaVersion:2,parentBranch:'develop',workingBranch:'old'}), configured({schemaVersion:3,parentBranch:'develop'}),
      configured({schemaVersion:3,workingBranch:'child'}),configured({schemaVersion:3,parentBranch:'same',workingBranch:'same'}),
      configured()+configured(), configured()+'copilot-configuration-start', configured()+'copilot-configuration-end', '<!-- copilot-configuration-start', '<!-- copilot-configuration-end -->',
      configured({schemaVersion:3,parentBranch:null,workingBranch:null})]) {
      expect(resolve([issue({body})],[pr()])).toEqual([]);
    }
  });
  it('rejects unsafe or empty configured refs instead of repairing their meaning', () => {
    for (const workingBranch of [' ', '/child','feature/../child','feature//child','-child','child.lock','child\nnext','child@{x}', 'x'.repeat(1025)]) {
      expect(resolve([issue({body:configured({schemaVersion:3,parentBranch:'develop',workingBranch})})],[pr()])).toEqual([]);
    }
  });
  it('normalizes full refs and surrounding whitespace in valid durable configuration', () => {
    expect(resolve([issue({body:configured({schemaVersion:3,parentBranch:' refs/heads/develop ',workingBranch:' refs/heads/bugfix/79-runtime '})})],[])).toEqual([current]);
  });
  it('withholds ambiguous native links rather than choosing the first PR', () => {
    expect(resolve([issue()], [pr(),pr({number:82,headRefName:'another'})])).toEqual([]);
  });
  it('withholds same-child different-parent ambiguity', () => {
    expect(resolve([issue()], [pr(),pr({number:82,baseRefName:'main'})])).toEqual([]);
  });
  it('deduplicates two native links to exactly the same pair', () => {
    expect(resolve([issue()], [pr(),pr({number:82})])).toHaveLength(1);
  });
  it('does not confuse an identically numbered issue in a foreign repository', () => {
    expect(resolve([issue()],[pr({closingIssuesReferences:{nodes:[{number:79,repository:{nameWithOwner:'other/repo'}}],pageInfo}})])).toEqual([]);
  });
  it('does not compare a fork head against a same-named local branch', () => {
    expect(resolve([issue()],[pr({headRepository:{nameWithOwner:'fork/repo'}})])).toEqual([]);
    expect(resolve([issue()],[pr({headRepository:null})])).toEqual([]);
  });
  it('requires repository proof for an explicitly linked branch', () => {
    expect(resolve([issue({linkedBranches:{nodes:[{ref:{name:'bugfix/80-input',repository:{nameWithOwner:'fork/repo'}}}],pageInfo}})],
      [pr({closingIssuesReferences:{nodes:[],pageInfo}})])).toEqual([]);
  });
  it('withholds fallback when linked branches are incomplete or unavailable', () => {
    expect(resolve([issue({linkedBranches:{nodes:[],pageInfo:{hasNextPage:true}}})],[pr()])).toEqual([]);
    expect(resolve([issue({linkedBranches:undefined})],[pr()])).toEqual([]);
    expect(resolve([issue({linkedBranches:{pageInfo}})],[pr()])).toEqual([]);
    expect(resolve([issue({linkedBranches:{nodes:[]}})],[pr()])).toEqual([]);
  });
  it('withholds fallback when closing evidence may omit a competing relationship', () => {
    expect(resolve([issue()],[pr({closingIssuesReferences:{nodes:[],pageInfo:{hasNextPage:true}}})])).toEqual([]);
    expect(resolve([issue()],[pr({closingIssuesReferences:undefined})])).toEqual([]);
    expect(resolve([issue()],[pr({closingIssuesReferences:{pageInfo}})])).toEqual([]);
    expect(resolve([issue()],[pr({closingIssuesReferences:{nodes:[]}})])).toEqual([]);
  });
  it('keeps durable authority usable without optional native inventories', () => {
    expect(resolve([issue({body:configured(),linkedBranches:undefined})],[pr({closingIssuesReferences:undefined})])).toEqual([current]);
  });
  it('rejects invalid issue identities', () => {
    for (const number of [0,-1,1.5,NaN]) expect(resolve([issue({number,body:configured()})],[pr()])).toEqual([]);
  });
  it('rejects invalid native pairs and ignores nullable closing nodes', () => {
    for (const change of [{baseRefName:' '},{headRefName:' '},{baseRefName:'same',headRefName:'same'},
      {closingIssuesReferences:{nodes:[null,{number:79}],pageInfo}}]) expect(resolve([issue()],[pr(change)])).toEqual([]);
  });
  it('maps a direct PR conversation without guessing another issue', () => {
    expect(dependencyFromPullRequest(pr())).toEqual({issueNumber:81,parentBranch:'develop',workingBranch:'bugfix/80-input'});
    expect(dependencyFromPullRequest(pr(),90).issueNumber).toBe(90);
  });
});

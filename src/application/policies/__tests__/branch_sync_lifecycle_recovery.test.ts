import { resolveLifecycleState, type LifecycleStateDecisionInput, type LifecycleStatePolicyResult } from '../lifecycle_state_policy';
import { ApplicationError } from '../../errors/application_error';
const parentSha = 'a'.repeat(40), childSha = 'b'.repeat(40), commitSha = 'c'.repeat(40);
const payload = { outcome: 'merged-cleanly', parentBranch: 'develop', workingBranch: 'feature/464-work', parentSha, childSha, commitSha, verificationCount: 5 };
function result(overrides: Partial<LifecycleStatePolicyResult> = {}): LifecycleStatePolicyResult {
  return { id: 'SyncBranchUseCase', success: true, executed: true, steps: [], errors: [], payload, ...overrides };
}
function input(results = [result()], overrides: Partial<LifecycleStateDecisionInput> = {}): LifecycleStateDecisionInput {
  return { eventName: 'issue_comment', action: 'created', isIssue: true, isPullRequest: false,
    issueOpened: false, issueDescriptionEdited: false, pullRequestMerged: false, pullRequestClosed: false, results, ...overrides };
}
describe('successful parent synchronization recovers issue lifecycle', () => {
  it.each(['merged-cleanly', 'merged-with-agent', 'already-aligned'])('returns to working after verified %s', outcome => {
    const value = result({ executed: outcome !== 'already-aligned', payload: { ...payload, outcome,
      ...(outcome === 'already-aligned' ? { commitSha: undefined, verificationCount: 0 } : {}) } });
    expect(resolveLifecycleState(input([value]))).toBe('working');
  });
  it.each(['dry-run-clean', 'dry-run-conflicted'])('preserves existing state for %s', outcome => {
    expect(resolveLifecycleState(input([result({ payload: { ...payload, outcome } })]))).toBeUndefined();
  });
  it('retains blocked after failed synchronization', () => {
    expect(resolveLifecycleState(input([result({ success: false, errors: [new ApplicationError('workflow.failed', 'Merge failed')] })]))).toBe('blocked');
  });
  it('lets another current executed failure dominate a successful synchronization', () => {
    expect(resolveLifecycleState(input([result(), result({ id: 'OtherTask', success: false })]))).toBe('blocked');
  });
  it('withholds working when a merged result did not execute', () => {
    expect(resolveLifecycleState(input([result({ executed: false })]))).toBeUndefined();
  });
  it.each([
    { label: 'foreign result identity', result: { id: 'OtherTask' } },
    { label: 'absent payload', result: { payload: undefined } },
    { label: 'unverified child SHA', result: { payload: { ...payload, childSha: 'invalid' } } },
    { label: 'unverified parent SHA', result: { payload: { ...payload, parentSha: 'invalid' } } },
    { label: 'missing pushed commit', result: { payload: { ...payload, commitSha: undefined } } },
    { label: 'negative verification count', result: { payload: { ...payload, verificationCount: -1 } } },
    { label: 'identical branches', result: { payload: { ...payload, workingBranch: 'develop' } } },
    { label: 'unsafe parent', result: { payload: { ...payload, parentBranch: 'develop\nforeign' } } },
    { label: 'missing parent', result: { payload: { ...payload, parentBranch: undefined } } },
    { label: 'missing working branch', result: { payload: { ...payload, workingBranch: undefined } } },
    { label: 'unsafe working branch', result: { payload: { ...payload, workingBranch: 'feature/work\nforeign' } } },
    { label: 'unbounded parent name', result: { payload: { ...payload, parentBranch: 'x'.repeat(257) } } },
  ])('rejects $label', entry => {
    expect(resolveLifecycleState(input([result(entry.result)]))).toBeUndefined();
  });
  it('does not infer a working branch for a branchless help issue', () => {
    expect(resolveLifecycleState(input([result()], { issueBranchlessHelp: true }))).toBeUndefined();
  });
  it('does not change unrelated issue events', () => {
    expect(resolveLifecycleState(input([result()], { eventName: 'issues' }))).toBeUndefined();
  });
  it('does not certify a PR as ready from a branch synchronization', () => {
    expect(resolveLifecycleState(input([result()], { isIssue: false, isPullRequest: true }))).toBeUndefined();
  });
  it('withholds recovery from aligned evidence carrying a nonexecuted error', () => {
    expect(resolveLifecycleState(input([result({ executed: false, payload: { ...payload, outcome: 'already-aligned' },
      errors: [new ApplicationError('provider.unavailable', 'Read failed')] })]))).toBeUndefined();
  });
});


describe('unavailable sync evidence cannot recover lifecycle', () => {
  it('preserves state for a nonexecuted failed sync result', () => {
    expect(resolveLifecycleState(input([result({ success: false, executed: false })]))).toBeUndefined();
  });
  it('rejects a nonnumeric verification count', () => {
    expect(resolveLifecycleState(input([result({ payload: { ...payload, verificationCount: 'five' } })]))).toBeUndefined();
  });
});

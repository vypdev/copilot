import { decideIssueWorkflowRuntime } from '../issue_workflow_runtime_policy';

const base = {
  unlinkedPullRequest: false,
  route: 'issue' as const,
  explicit: false,
  hasManagedState: false,
  hasDurableOperation: false,
};

describe('issue workflow runtime policy', () => {
  it('executes eligible and unlinked pull-request work', () => {
    expect(decideIssueWorkflowRuntime({ ...base, admission: { status: 'eligible', kind: 'feature' } })).toEqual({ mode: 'execute' });
    expect(decideIssueWorkflowRuntime({ ...base, admission: { status: 'disabled', kind: 'feature' }, unlinkedPullRequest: true })).toEqual({ mode: 'execute' });
  });

  it.each([
    [{ status: 'unmanaged', reason: 'no-recognized-kind' } as const, 'unmanaged'],
    [{ status: 'disabled', kind: 'bugfix' } as const, 'disabled'],
  ])('makes passive %s work a no-op and explicit work blocking', (admission, phrase) => {
    expect(decideIssueWorkflowRuntime({ ...base, admission }).mode).toBe('noop');
    const explicit = decideIssueWorkflowRuntime({ ...base, admission, explicit: true });
    expect(explicit.mode).toBe('block');
    expect(explicit.message).toContain(phrase);
  });

  it('always blocks conflicts and invalid bodies', () => {
    expect(decideIssueWorkflowRuntime({
      ...base, admission: { status: 'conflict', kinds: ['feature', 'bugfix'] },
    })).toMatchObject({ mode: 'block', message: expect.stringContaining('feature, bugfix') });
    expect(decideIssueWorkflowRuntime({
      ...base, admission: { status: 'invalid', kind: 'release', missingHeadings: ['Changelog'] },
    })).toMatchObject({ mode: 'block', message: expect.stringContaining('Changelog') });
    expect(decideIssueWorkflowRuntime({
      ...base, admission: { status: 'invalid', kind: 'release', missingHeadings: [], invalidFields: ['Release Type'] },
    })).toMatchObject({ mode: 'block', message: expect.stringContaining('Release Type') });
    expect(decideIssueWorkflowRuntime({
      ...base, admission: { status: 'invalid', kind: 'release', missingHeadings: [] },
    })).toMatchObject({ mode: 'block', message: expect.stringContaining('unknown') });
  });

  it('allows only PR/push continuation for disabled ordinary managed work', () => {
    const admission = { status: 'disabled', kind: 'feature' } as const;
    expect(decideIssueWorkflowRuntime({ ...base, admission, hasManagedState: true, route: 'pull-request' }).mode)
      .toBe('continuation-only');
    expect(decideIssueWorkflowRuntime({ ...base, admission, hasManagedState: true, route: 'push' }).mode)
      .toBe('continuation-only');
    expect(decideIssueWorkflowRuntime({ ...base, admission, hasManagedState: true, route: 'single-action', explicit: true }).mode)
      .toBe('block');
    expect(decideIssueWorkflowRuntime({ ...base, admission, hasManagedState: true }).mode).toBe('noop');
  });

  it('finishes an existing durable operation but rejects a new deployment', () => {
    const admission = { status: 'disabled', kind: 'release' } as const;
    expect(decideIssueWorkflowRuntime({
      ...base,
      admission,
      route: 'single-action',
      explicit: true,
      hasDurableOperation: true,
      singleAction: 'continue_deployment_action',
    }).mode).toBe('durable-operation');
    expect(decideIssueWorkflowRuntime({
      ...base,
      admission,
      route: 'single-action',
      explicit: true,
      hasDurableOperation: true,
      singleAction: 'prepare_deployment_action',
    }).mode).toBe('block');
    expect(decideIssueWorkflowRuntime({
      ...base,
      admission,
      route: 'single-action',
      explicit: true,
      hasDurableOperation: true,
      singleAction: 'unknown_action',
    }).mode).toBe('block');
    expect(decideIssueWorkflowRuntime({
      ...base,
      admission,
      route: 'single-action',
      explicit: true,
      hasDurableOperation: true,
    }).mode).toBe('block');
    expect(decideIssueWorkflowRuntime({
      ...base,
      admission,
      hasDurableOperation: true,
    }).mode).toBe('noop');
    expect(decideIssueWorkflowRuntime({
      ...base,
      admission,
      route: 'pull-request',
      hasDurableOperation: true,
    }).mode).toBe('durable-operation');
  });

  it('keeps bounded failure publication reachable', () => {
    expect(decideIssueWorkflowRuntime({
      ...base,
      admission: { status: 'disabled', kind: 'release' },
      route: 'single-action',
      explicit: true,
      singleAction: 'publish_issue_comment',
    })).toEqual({ mode: 'execute' });
  });
});

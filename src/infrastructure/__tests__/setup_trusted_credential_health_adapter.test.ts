import { SetupTrustedCredentialHealthAdapter } from '../setup_trusted_credential_health_adapter';
import type { SetupCredentialRequirement } from '../../domain/setup';

const content = 'name: Trusted fixture\non: workflow_dispatch\n';
const path = '.github/workflows/copilot_credential_health.yml';
const sha = 'a'.repeat(40);
const now = Date.parse('2026-10-17T14:00:00Z');
const requirements: SetupCredentialRequirement[] = [
  { name: 'PAT', kind: 'workflowPat', description: 'Bot' },
  { name: 'OPENAI_API_KEY', kind: 'apiKey', description: 'Provider', provider: 'openai' },
];
function fixture() {
  const run = { id: 19, run_attempt: 1, workflow_id: 9, repository: { id: 7 }, head_branch: 'master', head_sha: sha,
    event: 'workflow_dispatch', status: 'completed', run_started_at: '2026-10-17T13:59:30Z', updated_at: '2026-10-17T13:59:40Z' };
  const secrets = requirements.map(requirement => ({ name: requirement.name, updated_at: '2026-10-17T13:00:00Z' }));
  const jobs = requirements.map(requirement => ({ name: `Verify ${requirement.name}`, run_id: 19, head_sha: sha,
    status: 'completed', conclusion: 'success', completed_at: '2026-10-17T13:59:40Z' }));
  const actions = {
    getWorkflow: jest.fn().mockResolvedValue({ data: { id: 9, path, state: 'active' } }),
    listWorkflowRuns: jest.fn().mockResolvedValue({ data: { workflow_runs: [run] } }),
    getWorkflowRun: jest.fn().mockResolvedValue({ data: run }),
    listJobsForWorkflowRun: jest.fn().mockResolvedValue({ data: { total_count: 2, jobs } }),
    listRepoSecrets: jest.fn().mockResolvedValue({ data: { total_count: 0, secrets: [] } }),
    listRepoOrganizationSecrets: jest.fn().mockResolvedValue({ data: { total_count: 2, secrets } }),
    createWorkflowDispatch: jest.fn(),
  };
  const client = { rest: { actions,
    repos: { get: jest.fn().mockResolvedValue({ data: { id: 7, default_branch: 'master' } }),
      getContent: jest.fn().mockResolvedValue({ data: { path, encoding: 'base64', content: Buffer.from(content).toString('base64') } }),
      createOrUpdateFileContents: jest.fn() },
    git: { getRef: jest.fn().mockResolvedValue({ data: { object: { sha } } }), createRef: jest.fn() } } };
  const provider = { getClient: jest.fn(() => client) };
  const adapter = new SetupTrustedCredentialHealthAdapter(provider, { workflowContent: content, now: () => now });
  return { client, actions, run, jobs, secrets, provider, adapter,
    inspect: () => adapter.validateTrustedDefault('acme', 'repo', 'fixture-operator-token', requirements) };
}

describe('read-only trusted default-branch credential evidence', () => {
  it('accepts fresh exact-template evidence tied to unchanged effective Secret metadata', async () => {
    const f = fixture();
    expect(await f.inspect()).toEqual(requirements.map(requirement => expect.objectContaining({ name: requirement.name,
      status: 'valid', verificationRunUrl: 'https://github.com/acme/repo/actions/runs/19' })));
    expect(f.client.rest.repos.getContent).toHaveBeenCalledWith(expect.objectContaining({ ref: sha, path }));
    expect(f.client.rest.repos.get).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({
      timeout: expect.any(Number), signal: expect.any(AbortSignal),
    }) }));
    expect(f.actions.createWorkflowDispatch).not.toHaveBeenCalled();
    expect(f.client.rest.git.createRef).not.toHaveBeenCalled();
    expect(f.client.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
  });

  it('aborts a non-settling transport within the fixed read deadline and releases its timer', async () => {
    jest.useFakeTimers();
    try {
      const f = fixture();
      f.client.rest.repos.get.mockImplementation(() => new Promise(() => undefined));
      const inspection = f.inspect();
      await jest.advanceTimersByTimeAsync(15_000);
      expect(await inspection).toBeUndefined();
      const request = f.client.rest.repos.get.mock.calls[0][0] as { request: { signal: AbortSignal; timeout: number } };
      expect(request.request.signal.aborted).toBe(true);
      expect(request.request.timeout).toBe(15_000);
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });

  it('bounds the complete evidence inspection rather than restarting its budget for each read', async () => {
    jest.useFakeTimers();
    try {
      const f = fixture();
      f.client.rest.repos.get.mockImplementation(() => new Promise(resolve => setTimeout(() =>
        resolve({ data: { id: 7, default_branch: 'master' } }), 10_000)));
      f.client.rest.git.getRef.mockImplementation(() => new Promise(resolve => setTimeout(() =>
        resolve({ data: { object: { sha } } }), 10_000)));
      f.client.rest.repos.getContent.mockImplementation(() => new Promise(() => undefined));
      const inspection = f.inspect();
      await jest.advanceTimersByTimeAsync(30_000);
      expect(await inspection).toBeUndefined();
      const request = f.client.rest.repos.getContent.mock.calls[0][0] as { request: { timeout: number; signal: AbortSignal } };
      expect(request.request.timeout).toBe(10_000);
      expect(request.request.signal.aborted).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });

  it('rejects a customized workflow even when its filename and jobs look familiar', async () => {
    const f = fixture();
    f.client.rest.repos.getContent.mockResolvedValue({ data: { path, encoding: 'base64', content: Buffer.from('custom script').toString('base64') } });
    expect(await f.inspect()).toBeUndefined();
    expect(f.actions.listWorkflowRuns).not.toHaveBeenCalled();
  });

  it.each([
    { head_sha: 'b'.repeat(40) }, { head_branch: 'feature/untrusted' }, { workflow_id: 99 },
    { repository: { id: 99 } }, { event: 'pull_request' }, { run_attempt: 0 }, { status: 'in_progress' },
  ])('does not trust a run with mismatched identity %j', async change => {
    const f = fixture(); Object.assign(f.run, change);
    expect(await f.inspect()).toBeUndefined();
    expect(f.actions.listJobsForWorkflowRun).not.toHaveBeenCalled();
  });

  it('does not accept stale authentication evidence', async () => {
    const f = fixture(); f.run.updated_at = '2026-10-17T13:50:00Z';
    expect(await f.inspect()).toBeUndefined();
  });

  it('distinguishes an actual failed trusted check from missing evidence', async () => {
    const f = fixture(); f.jobs[0].conclusion = 'failure';
    expect(await f.inspect()).toEqual([expect.objectContaining({ name: 'PAT', status: 'invalid' }),
      expect.objectContaining({ name: 'OPENAI_API_KEY', status: 'valid' })]);
  });

  it.each(['cancelled', 'skipped', 'timed_out'])('keeps %s jobs pending instead of claiming invalid credentials', async conclusion => {
    const f = fixture(); f.jobs[0].conclusion = conclusion;
    expect((await f.inspect())?.[0].status).toBe('unverifiable');
  });

  it('does not reuse a successful run after that Secret changed', async () => {
    const f = fixture(); f.secrets[0].updated_at = '2026-10-17T13:59:50Z';
    expect((await f.inspect())?.[0].status).toBe('unverifiable');
  });

  it('checks repository overrides ahead of an older organization binding', async () => {
    const f = fixture(); f.actions.listRepoSecrets.mockResolvedValue({ data: { total_count: 1,
      secrets: [{ name: 'PAT', updated_at: '2026-10-17T13:59:50Z' }] } });
    expect((await f.inspect())?.[0].status).toBe('unverifiable');
  });

  it('detects a Secret rotation during evidence inspection', async () => {
    const f = fixture();
    f.actions.listRepoOrganizationSecrets.mockResolvedValueOnce({ data: { total_count: 2, secrets: f.secrets } })
      .mockResolvedValueOnce({ data: { total_count: 2, secrets: [
        { name: 'PAT', updated_at: '2026-10-17T13:59:50Z' }, f.secrets[1],
      ] } });
    expect((await f.inspect())?.[0].status).toBe('unverifiable');
  });

  it('reports a binding removed during inspection as missing', async () => {
    const f = fixture();
    f.actions.listRepoOrganizationSecrets.mockResolvedValueOnce({ data: { total_count: 2, secrets: f.secrets } })
      .mockResolvedValueOnce({ data: { total_count: 1, secrets: [f.secrets[1]] } });
    expect((await f.inspect())?.[0].status).toBe('missing');
  });

  it.each(['unavailable', 'malformed', 'oversized', 'duplicate'] as const)('keeps %s metadata unknown instead of treating it as empty', async scenario => {
    const f = fixture();
    if (scenario === 'unavailable') f.actions.listRepoSecrets.mockRejectedValue(new Error('private provider details'));
    if (scenario === 'malformed') f.actions.listRepoSecrets.mockResolvedValue({ data: { secrets: [] } });
    if (scenario === 'oversized') f.actions.listRepoSecrets.mockResolvedValue({ data: { total_count: 1001, secrets: [] } });
    if (scenario === 'duplicate') f.actions.listRepoSecrets.mockResolvedValue({ data: { total_count: 2, secrets: [f.secrets[0], f.secrets[0]] } });
    expect(await f.inspect()).toBeUndefined();
    expect(f.actions.createWorkflowDispatch).not.toHaveBeenCalled();
  });

  it('reads every bounded page before trusting an inherited binding', async () => {
    const f = fixture();
    const all = [...f.secrets, ...Array.from({ length: 99 }, (_, index) => ({ name: `OTHER_${index}`, updated_at: '2026-10-17T13:00:00Z' }))];
    f.actions.listRepoOrganizationSecrets.mockImplementation(async ({ page }: { page: number }) =>
      ({ data: { total_count: all.length, secrets: all.slice((page - 1) * 100, page * 100) } }));
    expect((await f.inspect())?.every(check => check.status === 'valid')).toBe(true);
    expect(f.actions.listRepoOrganizationSecrets.mock.calls.map(([request]) => request.page)).toEqual([1, 2, 1, 2]);
  });

  it('does not combine jobs from a different run attempt', async () => {
    const f = fixture(); f.actions.getWorkflowRun.mockResolvedValue({ data: { ...f.run, run_attempt: 2 } });
    expect(await f.inspect()).toBeUndefined();
  });

  it('does not trust evidence after the default branch head moved', async () => {
    const f = fixture(); f.client.rest.git.getRef.mockResolvedValueOnce({ data: { object: { sha } } })
      .mockResolvedValueOnce({ data: { object: { sha: 'b'.repeat(40) } } });
    expect(await f.inspect()).toBeUndefined();
  });

  it('does not keep using an old default branch after repository settings changed', async () => {
    const f = fixture(); f.client.rest.repos.get.mockResolvedValueOnce({ data: { id: 7, default_branch: 'master' } })
      .mockResolvedValueOnce({ data: { id: 7, default_branch: 'other-main' } });
    expect(await f.inspect()).toBeUndefined();
  });

  it('rejects incomplete job collections instead of inferring a pass from their first page', async () => {
    const f = fixture(); f.actions.listJobsForWorkflowRun.mockResolvedValue({ data: { total_count: 101, jobs: f.jobs } });
    expect(await f.inspect()).toBeUndefined();
  });

  it('keeps missing, duplicate and mismatched health jobs pending', async () => {
    const f = fixture(); f.actions.listJobsForWorkflowRun.mockResolvedValue({ data: { total_count: 2, jobs: [f.jobs[0], f.jobs[0]] } });
    expect((await f.inspect())?.every(check => check.status === 'unverifiable')).toBe(true);
  });

  it('requires the packaged trusted workflow and a nonempty requirement set', async () => {
    const f = fixture();
    expect(await f.adapter.validateTrustedDefault('acme', 'repo', 'token', [])).toBeUndefined();
    expect(await new SetupTrustedCredentialHealthAdapter(f.provider, { workflowContent: '' })
      .validateTrustedDefault('acme', 'repo', 'token', requirements)).toBeUndefined();
    expect(f.provider.getClient).not.toHaveBeenCalled();
  });
  it('accepts checkout line-ending differences without relaxing the workflow content check', async () => {
    const f = fixture();
    const adapter = new SetupTrustedCredentialHealthAdapter(f.provider, { workflowContent: content.replace(/\n/gu, '\r\n'), now: () => now });
    expect((await adapter.validateTrustedDefault('acme', 'repo', 'token', requirements))?.every(check => check.status === 'valid')).toBe(true);
  });
});

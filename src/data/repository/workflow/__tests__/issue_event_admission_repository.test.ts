import { IssueEventAdmissionRepository } from '../issue_event_admission_repository';
import type { IssueEventAdmissionContext } from '../../../../application/ports/issue_event_admission_ports';

const native = { id: 99, number: 21, title: 'Native', body: null, state: 'open', updated_at: '2026-10-28T00:00:00Z',
    user: { login: 'author' }, labels: [{ name: 'bug' }], assignees: [{ login: 'member' }], milestone: null, type: { name: 'Bug' },
    locked: false, repository_url: 'https://api.github.com/repos/org/repo' };
const context = { actor: 'maintainer', runId: 200, workflowRevision: 'a'.repeat(40) } as IssueEventAdmissionContext;
const run = { id: 200, actor: { login: 'maintainer' }, run_attempt: 1, created_at: '2026-10-28T00:01:00Z', workflow_id: 9, path: '.github/workflows/copilot_issue.yml', head_sha: 'a'.repeat(40), event: 'issues' };
const artifact = { name: 'receipt', created_at: '2026-10-28T00:02:00Z', expired: false, size_in_bytes: 256, workflow_run: { id: 199 } };
const source = { ...run, id: 199, completed_at: '2026-10-28T00:02:00Z', actor: { login: 'maintainer' }, status: 'completed', conclusion: 'success' };
function fixture() {
    const product = { rest: { users: { getAuthenticated: jest.fn().mockResolvedValue({ data: { login: 'product' } }) },
        issues: { get: jest.fn().mockResolvedValue({ data: native }) }, actions: { getWorkflowRun: jest.fn(), listArtifactsForRepo: jest.fn() } } };
    const evidence = { ...product, rest: { ...product.rest, actions: { getWorkflowRun: jest.fn().mockImplementation(async ({ run_id }) => ({ data: run_id === 200 ? run : source })),
        listArtifactsForRepo: jest.fn().mockResolvedValue({ data: { artifacts: [artifact] } }) } } };
    return { product, evidence, repository: new IssueEventAdmissionRepository(product, evidence, 'org', 'repo') };
}

describe('repository-bound issue admission queries', () => {
    it('uses the product credential for identity and native issue state, returning immutable selected facts', async () => {
        const f = fixture(); expect(await f.repository.authenticatedLogin()).toBe('product');
        const value = await f.repository.readIssue(21); expect(value).toMatchObject({ id: 99, body: '', labels: ['bug'], assignees: ['member'], issueType: 'Bug' });
        expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(value.labels)).toBe(true);
        expect(f.product.rest.issues.get).toHaveBeenCalledWith({ owner: 'org', repo: 'repo', issue_number: 21 });
    });
    it.each([{}, null, { login: '' }, { login: 8 }])('sanitizes malformed product identity %j', async data => {
        const f = fixture(); f.product.rest.users.getAuthenticated.mockResolvedValue({ data });
        await expect(f.repository.authenticatedLogin()).rejects.toMatchObject({ code: 'authorization.credential-invalid' });
    });
    it('removes private authentication and native-read diagnostics', async () => {
        const f = fixture(); f.product.rest.users.getAuthenticated.mockRejectedValue(new Error('PRIVATE_TOKEN'));
        f.product.rest.issues.get.mockRejectedValue(new Error('PRIVATE_BODY'));
        await expect(f.repository.authenticatedLogin()).rejects.not.toThrow('PRIVATE_TOKEN');
        await expect(f.repository.readIssue(21)).rejects.not.toThrow('PRIVATE_BODY');
    });
    it.each([null, [], { ...native, id: -1 }, { ...native, number: 22 }, { ...native, pull_request: {} },
        { ...native, body: 9 }, { ...native, title: null }, { ...native, state: 'unknown' }, { ...native, updated_at: 'bad' },
        { ...native, updated_at: null }, { ...native, user: {} }, { ...native, user: { login: ' ' } }, { ...native, updated_at: '1' }, { ...native, updated_at: '2026-13-28T00:00:00Z' }, { ...native, updated_at: '2026-02-30T00:00:00Z' }, { ...native, locked: 'false' }, { ...native, milestone: {} },
        { ...native, type: {} }, { ...native, labels: null }, { ...native, assignees: [null] }, { ...native, labels: [{ name: '' }] },
        { ...native, labels: Array.from({ length: 101 }, () => ({ name: 'label' })) },
        { ...native, repository_url: 'https://api.github.com/repos/other/repo' }, { ...native, repository_url: undefined },
        { ...native, repository_url: 'http://api.github.com/repos/org/repo' }, { ...native, repository_url: 'https://user:pass@api.github.com/repos/org/repo' },
        { ...native, repository_url: 'https://api.github.com/repos/org/repo?secret=1' }, { ...native, repository_url: 'https://api.github.com/repos/org/repo#fragment' },
    ])('rejects unverified or partial native state %j', async data => {
        const f = fixture(); f.product.rest.issues.get.mockResolvedValue({ data } as never);
        await expect(f.repository.readIssue(21)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
    });
    it('accepts native absence of optional type and a real milestone on enterprise API paths', async () => {
        const f = fixture(); f.product.rest.issues.get.mockResolvedValue({ data: { ...native, body: 'body', type: undefined, milestone: { id: 9 }, repository_url: 'https://ghe.example/api/v3/repos/org/repo' } } as never);
        expect(await f.repository.readIssue(21)).toMatchObject({ body: 'body', milestone: 9, issueType: null });
    });
    it('uses a separate read credential and requires same-workflow native successful provenance', async () => {
        const f = fixture(); expect(await f.repository.hasSuccessfulReceipt('receipt', context)).toBe(true);
        expect(f.product.rest.actions.listArtifactsForRepo).not.toHaveBeenCalled();
        expect(f.evidence.rest.actions.listArtifactsForRepo).toHaveBeenCalledWith({ owner: 'org', repo: 'repo', name: 'receipt', per_page: 100 });
    });
    it.each([null, { ...run, id: 201 }, { ...run, event: 'push' }, { ...run, head_sha: 'b'.repeat(40) }, { ...run, workflow_id: 0 },
        { ...run, path: undefined }, { ...run, actor: { login: 'foreign' } }, { ...run, run_attempt: 2 }, { ...run, created_at: 'bad' }, { ...run, path: '.github/workflows/../foreign.yml' }])('ignores receipts without current workflow authority %j', async data => {
        const f = fixture(); f.evidence.rest.actions.getWorkflowRun.mockResolvedValue({ data } as never);
        expect(await f.repository.hasSuccessfulReceipt('receipt', context)).toBe(false);
    });
    it.each([null, {}, { artifacts: [] }, { artifacts: [null] }, { artifacts: [{ ...artifact, name: 'other' }] },
        { artifacts: [{ ...artifact, expired: true }] }, { artifacts: [{ ...artifact, workflow_run: null }] },
        { artifacts: [{ ...artifact, workflow_run: { id: 200 } }] }, { artifacts: [{ ...artifact, created_at: '2026-10-28T00:01:00Z' }] }, { artifacts: [{ ...artifact, created_at: '2026-10-28T00:00:59Z' }] }, { artifacts: [{ ...artifact, created_at: null }] }, { artifacts: [{ ...artifact, size_in_bytes: 0 }] },
        { artifacts: [{ ...artifact, size_in_bytes: 4097 }] }])('retains work when receipt metadata is missing or invalid %j', async data => {
        const f = fixture(); f.evidence.rest.actions.listArtifactsForRepo.mockResolvedValue({ data } as never);
        expect(await f.repository.hasSuccessfulReceipt('receipt', context)).toBe(false);
    });
    it.each([null, { ...source, id: 198 }, { ...source, workflow_id: 8 }, { ...source, path: '.github/workflows/other.yml' },
        { ...source, head_sha: 'b'.repeat(40) }, { ...source, event: 'pull_request' }, { ...source, status: 'in_progress' },
        { ...source, conclusion: 'failure' }, { ...source, conclusion: 'cancelled' }, { ...source, actor: null }, { ...source, actor: { login: 'foreign' } }])(
        'never coalesces with failed, partial, foreign, stale or unproven source %j', async data => {
            const f = fixture(); f.evidence.rest.actions.getWorkflowRun.mockImplementation(async ({ run_id }) => ({ data: run_id === 200 ? run : data } as never));
            expect(await f.repository.hasSuccessfulReceipt('receipt', context)).toBe(false);
        });
});


it('accepts native ISO fractional timestamps without normalization or coercing absent authority into a login', async () => {
  const f = fixture(); f.product.rest.issues.get.mockResolvedValue({ data: { ...native, updated_at: '2026-10-28T00:00:00.125Z' } });
  expect((await f.repository.readIssue(21)).updatedAt).toBe('2026-10-28T00:00:00.125Z');
  const unusual = { ...context, actor: 'undefined' };
  f.evidence.rest.actions.getWorkflowRun.mockImplementation(async ({ run_id }) => ({ data: run_id === 200 ? { ...run, actor: { login: 'undefined' } } : { ...source, actor: {} } } as never));
  expect(await f.repository.hasSuccessfulReceipt('receipt', unusual)).toBe(false);
  f.evidence.rest.actions.getWorkflowRun.mockImplementation(async ({ run_id }) => ({ data: run_id === 200 ? { ...run, actor: {} } : { ...source, actor: { login: 'undefined' } } } as never));
  expect(await f.repository.hasSuccessfulReceipt('receipt', unusual)).toBe(false);
  f.evidence.rest.actions.getWorkflowRun.mockImplementation(async ({ run_id }) => ({ data: { ...(run_id === 200 ? run : source), actor: { login: 'undefined' } } } as never));
  expect(await f.repository.hasSuccessfulReceipt('receipt', unusual)).toBe(true);
});

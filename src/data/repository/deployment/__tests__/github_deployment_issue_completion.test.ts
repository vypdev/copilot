import { prepareManagedIssueCompletion as prepare } from '../github_deployment_issue_completion';
import type { ManagedPullRequestRecord } from '../../../../application/ports/deployment_orchestration_ports';
import type { GithubDeploymentClient } from '../../../../infrastructure/github/ports/github_deployment_provider_port';

const record: ManagedPullRequestRecord = { number: 40, nodeId: 'PR_40', repositoryFullName: 'owner/repo',
    body: '<!-- copilot-deployment operation-id="operation-12345678" phase="promotion" issue="355" -->',
    headBranch: 'release/3.4.0', headSha: 'a'.repeat(40), baseBranch: 'master', state: 'open', merged: false, autoMergeEnabled: false };
const reference = (number: number) => ({ number, repository: { nameWithOwner: 'owner/repo' } });

function fixture() {
    let linked = true;
    let sticky = false;
    let mutated = false;
    const issueId = 'I_355';
    let cursorMode = '';
    let patch: (value: ReturnType<typeof snapshot>) => void = () => undefined;
    const snapshot = () => {
        const refs = linked ? [reference(355), reference(1)] : [reference(1)];
        const value = { repository: { nameWithOwner: 'owner/repo', issue: { id: issueId, number: 355 },
            pullRequest: { id: 'PR_40', number: 40, state: 'OPEN', body: record.body, headRefName: record.headBranch,
                headRefOid: record.headSha, baseRefName: record.baseBranch, headRepository: { nameWithOwner: 'owner/repo' },
                closingIssuesReferences: { nodes: refs, pageInfo: { hasNextPage: false, endCursor: null as string | null } } } } };
        patch(value); return value;
    };
    const graphql = jest.fn(async (query: string, variables: Record<string, unknown>) => {
        if (query.includes('removeCloseIssueReferences')) {
            mutated = true; if (!sticky) linked = false;
            return { removeCloseIssueReferences: { issue: { id: issueId, number: 355 } } };
        }
        const value = snapshot();
        if (mutated && cursorMode) {
            const page = value.repository.pullRequest.closingIssuesReferences;
            page.nodes = Array.from({ length: 100 }, (_, i) => reference(i + (variables.cursor ? 101 : 1) + 500));
            page.pageInfo = { hasNextPage: ['excess', 'repeat'].includes(cursorMode) || !variables.cursor,
                endCursor: cursorMode === 'missing' ? null : cursorMode === 'repeat' ? 'first' : variables.cursor ? 'second' : 'first' };
        }
        return value;
    });
    const client = { graphql: graphql as GithubDeploymentClient['graphql'] };
    return { graphql, run: (expected = record) => prepare(client, 'owner', 'repo', expected),
        setLinked: (value: boolean) => { linked = value; }, setSticky: () => { sticky = true; },
        setPatch: (value: typeof patch) => { patch = value; }, setCursorMode: (value: string) => { cursorMode = value; },
        isLinked: () => linked, mutationCalls: () => graphql.mock.calls.filter(([q]) => q.includes('removeCloseIssueReferences')) };
}

it('removes only the owned launcher reference and verifies the other issue stays linked', async () => {
    const f = fixture(); await f.run(); expect(f.isLinked()).toBe(false);
    expect(f.mutationCalls()).toHaveLength(1);
    expect(f.mutationCalls()[0][1]).toEqual({ issueId: 'I_355', pullRequestIds: ['PR_40'] });
    expect(f.graphql).toHaveBeenCalledTimes(3);
});
it('is safe to replay after the reference was already detached', async () => {
    const f = fixture(); f.setLinked(false); await f.run(); await f.run(); expect(f.isLinked()).toBe(false);
});
it('rejects invalid expected identities before any provider call', async () => {
    for (const change of [{ number: 0 }, { number: 355 }, { body: '' }, { repositoryFullName: 'other/repo' },
        { state: 'closed' as const }, { merged: true }, { nodeId: '' }, { headSha: 'wrong' },
        { body: 42 as never }, { repositoryFullName: 42 as never }, { nodeId: 42 as never },
        { headBranch: '' }, { headBranch: 42 as never }, { baseBranch: '' }, { baseBranch: 42 as never }, { headSha: 42 as never }]) {
        const f = fixture(); await expect(f.run({ ...record, ...change })).rejects.toMatchObject({ code: 'provider.contract-invalid' });
        expect(f.graphql).not.toHaveBeenCalled();
    }
});
it('rejects missing, foreign or changed native ownership before mutation', async () => {
    const patches: Array<Parameters<ReturnType<typeof fixture>['setPatch']>[0]> = [
        x => { x.repository.nameWithOwner = 'other/repo'; }, x => { x.repository.issue.number = 356; },
        x => { Object.assign(x.repository, { nameWithOwner: 42 }); },
        x => { Object.assign(x.repository.issue, { id: 42 }); },
        x => { x.repository.issue.id = ''; }, x => { x.repository.pullRequest.id = 'PR_41'; },
        x => { x.repository.pullRequest.number = 41; }, x => { x.repository.pullRequest.state = 'CLOSED'; },
        x => { x.repository.pullRequest.headRepository.nameWithOwner = 'fork/repo'; },
        x => { x.repository.pullRequest.headRefName = 'other'; }, x => { x.repository.pullRequest.headRefOid = 'b'.repeat(40); },
        x => { x.repository.pullRequest.baseRefName = 'other'; }, x => { x.repository.pullRequest.body = ''; },
        x => { x.repository.pullRequest.body = record.body.replace('operation-12345678', 'other-operation'); },
        x => { x.repository.pullRequest.body = record.body.replace('promotion', 'reconciliation'); },
        x => { x.repository.pullRequest.body = record.body.replace('355', '356'); },
        x => { x.repository.pullRequest.body += record.body; },
    ];
    for (const patch of patches) { const f = fixture(); f.setPatch(patch);
        await expect(f.run()).rejects.toMatchObject({ code: 'provider.contract-invalid' }); expect(f.mutationCalls()).toHaveLength(0); }
});
it('blocks retained keyword or native closing references after the unlink response', async () => {
    const f = fixture(); f.setSticky(); await expect(f.run()).rejects.toMatchObject({ code: 'provider.conflict' });
});
it('maps read and mutation failures without granting merge authority', async () => {
    for (const first of [true, false]) { const f = fixture();
        if (first) f.graphql.mockRejectedValueOnce(new Error('private provider response'));
        else { const call = f.graphql.getMockImplementation()!; f.graphql.mockImplementation(async (q, v) => {
            if (q.includes('removeCloseIssueReferences')) throw new Error('private provider response'); return call(q, v); }); }
        const error = await f.run().then(() => { throw new Error('Expected provider failure.'); }, cause => cause);
        expect(error).toMatchObject({ code: 'provider.unavailable' });
        expect(error.message).not.toContain('private provider response');
    }
});
it('requires the mutation to confirm the exact launcher', async () => {
    const f = fixture(); const call = f.graphql.getMockImplementation()!;
    f.graphql.mockImplementation(async (q, v) => q.includes('removeCloseIssueReferences')
        ? { removeCloseIssueReferences: { issue: { id: 'OTHER', number: 355 } } } : call(q, v));
    await expect(f.run()).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it('checks both bounded pages before declaring the closing reference absent', async () => {
    const f = fixture(); f.setCursorMode('two'); await f.run();
    expect(f.graphql.mock.calls.filter(([q]) => q.includes('query'))).toHaveLength(3);
});
it('rejects a changed native launcher identity after the reference removal', async () => {
    const f = fixture(); f.setPatch(x => { if (f.mutationCalls().length) x.repository.issue.id = 'OTHER'; });
    await expect(f.run()).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it('rejects incomplete reference inventories or pagination', async () => {
    for (const kind of ['nodes', 'limit', 'boolean', 'entry', 'null-entry', 'repository', 'repository-type', 'missing', 'repeat']) {
        const f = fixture();
        if (['missing', 'repeat'].includes(kind)) f.setCursorMode(kind);
        else f.setPatch(x => { const refs = x.repository.pullRequest.closingIssuesReferences;
            if (kind === 'nodes') Object.assign(refs, { nodes: null });
            if (kind === 'limit') refs.nodes = Array.from({ length: 101 }, (_, i) => reference(i + 1));
            if (kind === 'boolean') Object.assign(refs.pageInfo, { hasNextPage: null });
            if (kind === 'entry') refs.nodes = [reference(0)];
            if (kind === 'null-entry') Object.assign(refs, { nodes: [null] });
            if (kind === 'repository') refs.nodes[0].repository.nameWithOwner = '';
            if (kind === 'repository-type') Object.assign(refs.nodes[0].repository, { nameWithOwner: 42 });
        });
        await expect(f.run()).rejects.toMatchObject({ code: 'provider.contract-invalid' });
    }
});
it('fails closed when absence cannot be established within 200 references', async () => {
    const f = fixture(); f.setCursorMode('excess'); await expect(f.run()).rejects.toThrow('200-reference');
});

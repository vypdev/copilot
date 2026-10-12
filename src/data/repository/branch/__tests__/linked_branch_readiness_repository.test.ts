import { LinkedBranchReadinessRepository } from '../linked_branch_readiness_repository';

const sha = 'a'.repeat(40);

describe('LinkedBranchReadinessRepository', () => {
  it('selects the exact issue-linked ref and its commit SHA', async () => {
    const graphql = jest.fn().mockResolvedValue({ repository: { ref: { target: { oid: sha } }, issue: { linkedBranches: { nodes: [
      { ref: { name: 'refs/heads/feature/420-other', target: { oid: 'b'.repeat(40) } } },
      { ref: { name: 'refs/heads/feature/42-change', repository: { nameWithOwner: 'acme/repo' }, target: { oid: sha } } },
    ] } } } });
    const repository = new LinkedBranchReadinessRepository({ getClient: () => ({ graphql }) } as never);
    await expect(repository.getLinkedBranch('acme', 'repo', 42, 'feature/42-change', 'token'))
      .resolves.toEqual({ name: 'feature/42-change', headSha: sha });
    expect(graphql).toHaveBeenCalledWith(expect.stringContaining('linkedBranches(first: 100)'), {
      owner: 'acme', repository: 'repo', issueNumber: 42, ref: 'refs/heads/feature/42-change',
    });
  });

  it.each([
    ['stale native SHA', 'b'.repeat(40), 'acme/repo'],
    ['deleted native branch', undefined, 'acme/repo'],
    ['foreign native repository', sha, 'other/repo'],
    ['missing native repository', sha, undefined],
  ])('rejects %s even with an otherwise valid PR fallback', async (_reason, remoteSha, nameWithOwner) => {
    const graphql = jest.fn().mockResolvedValue({ repository: {
      ref: { target: { oid: remoteSha } }, issue: {
        linkedBranches: { nodes: [{ ref: { name: 'feature/42-change', repository: { nameWithOwner }, target: { oid: sha } } }] },
        closedByPullRequestsReferences: { nodes: [{ state: 'OPEN', headRefName: 'feature/42-change', headRefOid: remoteSha, headRepository: { nameWithOwner: 'acme/repo' } }] },
      },
    } });
    const repository = new LinkedBranchReadinessRepository({ getClient: () => ({ graphql }) } as never);
    await expect(repository.getLinkedBranch('acme', 'repo', 42, 'feature/42-change', 'token')).resolves.toBeUndefined();
  });

  it.each(['', '../feature/42-change', '/feature/42-change'])('rejects unsafe expected ref %s', async branch => {
    const graphql = jest.fn().mockResolvedValue({ repository: { issue: { linkedBranches: { nodes: [] } } } });
    const repository = new LinkedBranchReadinessRepository({ getClient: () => ({ graphql }) } as never);
    await expect(repository.getLinkedBranch('acme', 'repo', 42, branch, 'token')).resolves.toBeUndefined();
  });

  it('rejects a matching linked name without a valid remote commit SHA', async () => {
    const graphql = jest.fn().mockResolvedValue({ repository: { issue: { linkedBranches: { nodes: [
      { ref: { name: '/feature/42-change', target: { oid: 'invalid' } } },
    ] } } } });
    const repository = new LinkedBranchReadinessRepository({ getClient: () => ({ graphql }) } as never);
    await expect(repository.getLinkedBranch('acme', 'repo', 42, 'feature/42-change', 'token')).resolves.toBeUndefined();
  });

  const linkedPr = () => ({ state: 'OPEN', headRefName: 'feature/42-change', headRefOid: sha,
    headRepository: { nameWithOwner: 'acme/repo' } });

  it('retains exact branch proof after GitHub replaces the native branch connection with its PR', async () => {
    const graphql = jest.fn().mockResolvedValue({ repository: {
      ref: { target: { oid: sha } },
      issue: { linkedBranches: { nodes: [] }, closedByPullRequestsReferences: { nodes: [linkedPr()] } },
    } });
    const repository = new LinkedBranchReadinessRepository({ getClient: () => ({ graphql }) } as never);
    await expect(repository.getLinkedBranch('acme', 'repo', 42, 'feature/42-change', 'token'))
      .resolves.toEqual({ name: 'feature/42-change', headSha: sha });
  });

  it.each([
    ['closed PR', { state: 'CLOSED' }, sha],
    ['fork head', { headRepository: { nameWithOwner: 'other/repo' } }, sha],
    ['different branch', { headRefName: 'feature/420-other' }, sha],
    ['stale PR SHA', { headRefOid: 'b'.repeat(40) }, sha],
    ['deleted remote branch', {}, undefined],
    ['invalid remote SHA', {}, 'invalid'],
  ])('does not use %s as branch authority', async (_reason, overrides, remoteSha) => {
    const graphql = jest.fn().mockResolvedValue({ repository: {
      ref: { target: { oid: remoteSha } },
      issue: { linkedBranches: { nodes: [] }, closedByPullRequestsReferences: { nodes: [{ ...linkedPr(), ...overrides as object }] } },
    } });
    const repository = new LinkedBranchReadinessRepository({ getClient: () => ({ graphql }) } as never);
    await expect(repository.getLinkedBranch('acme', 'repo', 42, 'feature/42-change', 'token')).resolves.toBeUndefined();
  });
});

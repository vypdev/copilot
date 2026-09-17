import { LinkedBranchReadinessRepository } from '../linked_branch_readiness_repository';

const sha = 'a'.repeat(40);

describe('LinkedBranchReadinessRepository', () => {
  it('selects the exact issue-linked ref and its commit SHA', async () => {
    const graphql = jest.fn().mockResolvedValue({ repository: { issue: { linkedBranches: { nodes: [
      { ref: { name: 'refs/heads/feature/420-other', target: { oid: 'b'.repeat(40) } } },
      { ref: { name: 'refs/heads/feature/42-change', target: { oid: sha } } },
    ] } } } });
    const repository = new LinkedBranchReadinessRepository({ getClient: () => ({ graphql }) } as never);
    await expect(repository.getLinkedBranch('acme', 'repo', 42, 'feature/42-change', 'token'))
      .resolves.toEqual({ name: 'feature/42-change', headSha: sha });
    expect(graphql).toHaveBeenCalledWith(expect.stringContaining('linkedBranches(first: 100)'), {
      owner: 'acme', repository: 'repo', issueNumber: 42,
    });
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
});

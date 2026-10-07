import { RepositoryVariablesCommandRepository } from '../repository_variables_repository';

function fixture() {
  const actions = {
    listRepoVariables: jest.fn().mockResolvedValue({ data: { variables: [] } }),
    createRepoVariable: jest.fn(), updateRepoVariable: jest.fn(),
    listOrgVariables: jest.fn().mockResolvedValue({ data: { variables: [{ name: 'EXISTING', visibility: 'selected' }] } }),
    createOrgVariable: jest.fn(), updateOrgVariable: jest.fn(), addSelectedRepoToOrgVariable: jest.fn(),
  };
  return { actions, repository: new RepositoryVariablesCommandRepository({ getClient: () => ({ rest: { actions } }) }) };
}
const target = { scope: 'organization' as const, organizationVisibility: 'selected' as const, repositoryId: 42 };

describe('setup Variable write failures', () => {
  it('updates only the existing value and grants repository access without replacing its visibility or other grants', async () => {
    const { actions, repository } = fixture();
    await repository.upsertScopedVariables('owner', 'repo', 'fixture', target, [{ name: 'EXISTING', value: 'replacement' }]);
    expect(actions.updateOrgVariable).toHaveBeenCalledWith({ org: 'owner', name: 'EXISTING', value: 'replacement' });
    expect(actions.addSelectedRepoToOrgVariable).toHaveBeenCalledWith({ org: 'owner', name: 'EXISTING', repository_id: 42 });
    expect(actions.createOrgVariable).not.toHaveBeenCalled();
  });

  it.each([[401, 'authorization'], [403, 'authorization'], [400, 'invalid-input'], [422, 'invalid-input'], [409, 'conflict'], [429, 'rate-limited'], [503, 'unavailable']] as const)('maps HTTP %s to a value-free semantic creation failure', async (status, reason) => {
      const { actions, repository } = fixture();
      actions.createOrgVariable.mockRejectedValue(Object.assign(new Error('sensitive provider body'), { status }));
      const result = await repository.upsertScopedVariables('owner', 'repo', 'fixture', target, [{ name: 'NEW_VAR', value: 'private-value' }]);
      expect(result.failures).toEqual([{ name: 'NEW_VAR', scope: 'organization', phase: 'create', reason }]);
      expect(result.unclassifiedErrors).toEqual([]);
      expect(result.created).toBe(0);
      expect(actions.addSelectedRepoToOrgVariable).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toMatch(/private-value|sensitive provider body/);
    });

  it.each([
    { headers: { 'retry-after': '60' } },
    { headers: { 'x-ratelimit-remaining': '0' } },
    { data: { message: 'You have exceeded the secondary rate limit. private-provider-detail' } },
  ])('distinguishes a GitHub 403 rate limit from missing Variable permission: %j', async response => {
    const { actions, repository } = fixture();
    actions.createOrgVariable.mockRejectedValue({ status: 403, response });
    const result = await repository.upsertScopedVariables('owner', 'repo', 'fixture', target, [{ name: 'NEW_VAR', value: 'private-value' }]);
    expect(result.failures?.[0].reason).toBe('rate-limited');
    expect(JSON.stringify(result)).not.toMatch(/private-value|private-provider-detail/);
  });

  it('keeps a non-HTTP exception value private while reporting provider unavailability', async () => {
    const { actions, repository } = fixture();
    actions.createRepoVariable.mockRejectedValue('private-exception-value');
    const result = await repository.upsert('owner', 'repo', 'fixture', [{ name: 'NEW_VAR', value: 'value' }]);
    expect(result.failures?.[0].reason).toBe('unavailable');
    expect(result.unclassifiedErrors).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('private-exception-value');
  });

  it('reports a failed grant after an update as repository-access requiring inspection', async () => {
    const { actions, repository } = fixture();
    actions.addSelectedRepoToOrgVariable.mockRejectedValue({ status: 403 });
    const result = await repository.upsertScopedVariables('owner', 'repo', 'fixture', target, [{ name: 'EXISTING', value: 'replacement' }]);
    expect(actions.updateOrgVariable).toHaveBeenCalled();
    expect(result.failures).toEqual([{ name: 'EXISTING', scope: 'organization', phase: 'repository-access', reason: 'authorization' }]);
    expect(result.errors).toHaveLength(1);
  });

  it('reports a repository Variable update denial without dropping other completed writes', async () => {
    const { actions, repository } = fixture();
    actions.listRepoVariables.mockResolvedValue({ data: { variables: [{ name: 'EXISTING', value: 'before' }] } });
    actions.updateRepoVariable.mockRejectedValue({ status: 403 });
    const result = await repository.upsert('owner', 'repo', 'fixture', [{ name: 'NEW_VAR', value: 'new' }, { name: 'EXISTING', value: 'replacement' }]);
    expect(result.created).toBe(1);
    expect(result.failures).toEqual([{ name: 'EXISTING', scope: 'repository', phase: 'update', reason: 'authorization' }]);
  });
});

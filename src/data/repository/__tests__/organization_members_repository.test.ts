import { OrganizationMembersRepository } from '../organization/organization_members_repository';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubOrganizationMembersClient } from '../../../application/ports/github_identity_ports';

describe('OrganizationMembersRepository', () => {
  function createRepository() {
    const iterator = jest.fn(async function* (_method: unknown, parameters: Record<string, unknown>) {
      if (parameters.team_slug === 'core') {
        yield { data: [{ login: 'alice' }] };
        yield { data: [{ login: 'bob' }, { login: 'alice' }] };
        return;
      }
      if (parameters.team_slug === 'support') {
        yield { data: [{ login: 'carol' }] };
        return;
      }
      yield { data: [{ slug: 'core' }] };
      yield { data: [{ slug: 'support' }] };
    });
    const client = {
      paginate: { iterator },
      rest: { teams: { list: jest.fn(), listMembersInOrg: jest.fn() } },
    } as unknown as GithubOrganizationMembersClient;
    const provider = { getClient: jest.fn(() => client) } as unknown as GithubClientPort<GithubOrganizationMembersClient>;
    return { repository: new OrganizationMembersRepository(provider), iterator };
  }

  it('collects and deduplicates members across paginated teams and member pages', async () => {
    const { repository, iterator } = createRepository();

    await expect(repository.getAllMembers('acme', 'token')).resolves.toEqual(['alice', 'bob', 'carol']);
    expect(iterator).toHaveBeenCalledTimes(3);
  });

  it('selects only available members from all paginated pages', async () => {
    const { repository } = createRepository();

    await expect(repository.getRandomMembers('acme', 2, ['alice'], 'token')).resolves.toEqual(['bob', 'carol']);
  });
});

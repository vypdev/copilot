import { AuthenticatedUserRepository } from '../organization/authenticated_user_repository';
import type { GithubAuthenticatedUserClient } from '../../../application/ports/github_identity_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';

describe('AuthenticatedUserRepository', () => {
  const getAuthenticated = jest.fn();
  const provider = {
    getClient: jest.fn(() => ({ rest: { users: { getAuthenticated } } })),
  } as unknown as GithubClientPort<GithubAuthenticatedUserClient>;
  const repository = new AuthenticatedUserRepository(provider);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the authenticated login', async () => {
    getAuthenticated.mockResolvedValue({ data: { login: 'octocat', name: 'The Octocat', email: 'octo@example.com' } });

    await expect(repository.getUserFromToken('token')).resolves.toBe('octocat');
    expect(provider.getClient).toHaveBeenCalledWith('token');
  });

  it('normalizes name and email details from the authenticated user', async () => {
    getAuthenticated.mockResolvedValue({ data: { login: 'octocat', name: '  Octocat  ', email: '  octo@example.com  ' } });

    await expect(repository.getTokenUserDetails('token')).resolves.toEqual({ name: 'Octocat', email: 'octo@example.com' });
  });

  it('uses stable fallbacks when optional identity fields are absent', async () => {
    getAuthenticated.mockResolvedValue({ data: { login: 'octocat', name: null, email: null } });

    await expect(repository.getTokenUserDetails('token')).resolves.toEqual({
      name: 'octocat',
      email: 'octocat@users.noreply.github.com',
    });
  });

  it('propagates provider authentication errors', async () => {
    const error = new Error('unauthorized');
    getAuthenticated.mockRejectedValue(error);

    await expect(repository.getUserFromToken('token')).rejects.toBe(error);
    await expect(repository.getTokenUserDetails('token')).rejects.toBe(error);
  });
});

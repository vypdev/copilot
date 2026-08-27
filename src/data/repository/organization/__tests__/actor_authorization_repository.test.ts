import { ActorAuthorizationRepository } from '../actor_authorization_repository';

jest.mock('../../../../utils/logger', () => ({
  logDebugInfo: jest.fn(),
}));

describe('ActorAuthorizationRepository', () => {
  const getByUsername = jest.fn();
  const checkMembershipForUser = jest.fn();
  const repository = new ActorAuthorizationRepository({
    getClient: jest.fn(() => ({
      rest: {
        users: { getByUsername },
        orgs: { checkMembershipForUser },
      },
    })),
  } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    getByUsername.mockResolvedValue({ data: { type: 'Organization' } });
    checkMembershipForUser.mockResolvedValue({});
  });

  it('allows an organization actor when membership succeeds', async () => {
    await expect(repository.isActorAllowedToModifyFiles('acme', 'alice', 'token')).resolves.toBe(true);
    expect(checkMembershipForUser).toHaveBeenCalledWith({ org: 'acme', username: 'alice' });
  });

  it('denies an organization actor when membership returns not found', async () => {
    checkMembershipForUser.mockRejectedValue({ status: 404 });
    await expect(repository.isActorAllowedToModifyFiles('acme', 'alice', 'token')).resolves.toBe(false);
  });

  it('denies and logs unexpected membership failures', async () => {
    checkMembershipForUser.mockRejectedValue(new Error('membership unavailable'));
    await expect(repository.isActorAllowedToModifyFiles('acme', 'alice', 'token')).resolves.toBe(false);
  });

  it('allows the owner of a user repository without membership lookup', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'User' } });
    await expect(repository.isActorAllowedToModifyFiles('alice', 'alice', 'token')).resolves.toBe(true);
    expect(checkMembershipForUser).not.toHaveBeenCalled();
  });

  it('denies a different actor on a user repository', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'User' } });
    await expect(repository.isActorAllowedToModifyFiles('alice', 'bob', 'token')).resolves.toBe(false);
    expect(checkMembershipForUser).not.toHaveBeenCalled();
  });

  it('denies when owner lookup fails', async () => {
    getByUsername.mockRejectedValue(new Error('lookup unavailable'));
    await expect(repository.isActorAllowedToModifyFiles('acme', 'alice', 'token')).resolves.toBe(false);
  });
});

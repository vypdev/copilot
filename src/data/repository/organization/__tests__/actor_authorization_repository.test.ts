import { ActorAuthorizationRepository } from '../actor_authorization_repository';

jest.mock('../../../../utils/logger', () => ({
  logDebugInfo: jest.fn(),
}));

describe('ActorAuthorizationRepository', () => {
  const getByUsername = jest.fn();
  const checkMembershipForUser = jest.fn();
  const getCollaboratorPermissionLevel = jest.fn();
  const repository = new ActorAuthorizationRepository({
    getClient: jest.fn(() => ({
      rest: {
        users: { getByUsername },
        orgs: { checkMembershipForUser },
        repos: { getCollaboratorPermissionLevel },
      },
    })),
  } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    getByUsername.mockResolvedValue({ data: { type: 'Organization' } });
    checkMembershipForUser.mockResolvedValue({});
    getCollaboratorPermissionLevel.mockResolvedValue({ data: { permission: 'pull' } });
  });

  it('allows an organization actor when membership succeeds', async () => {
    await expect(repository.isActorAllowedToModifyFiles('acme', 'project', 'alice', 'token')).resolves.toBe(true);
    expect(checkMembershipForUser).toHaveBeenCalledWith({ org: 'acme', username: 'alice' });
  });

  it('denies an organization actor when membership returns not found', async () => {
    checkMembershipForUser.mockRejectedValue({ status: 404 });
    await expect(repository.isActorAllowedToModifyFiles('acme', 'project', 'alice', 'token')).resolves.toBe(false);
  });

  it('denies and logs unexpected membership failures', async () => {
    checkMembershipForUser.mockRejectedValue(new Error('membership unavailable'));
    await expect(repository.isActorAllowedToModifyFiles('acme', 'project', 'alice', 'token')).resolves.toBe(false);
  });

  it('denies and logs a non-Error membership failure', async () => {
    checkMembershipForUser.mockRejectedValue({ status: 500, message: 'membership unavailable' });
    await expect(repository.isActorAllowedToModifyFiles('acme', 'project', 'alice', 'token')).resolves.toBe(false);
  });

  it('allows the owner of a user repository without membership lookup', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'User' } });
    await expect(repository.isActorAllowedToModifyFiles('alice', 'project', 'alice', 'token')).resolves.toBe(true);
    expect(checkMembershipForUser).not.toHaveBeenCalled();
    expect(getCollaboratorPermissionLevel).not.toHaveBeenCalled();
  });

  it('allows a write collaborator on a user repository', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'User' } });
    getCollaboratorPermissionLevel.mockResolvedValue({ data: { permission: 'push' } });
    await expect(repository.isActorAllowedToModifyFiles('alice', 'project', 'bob', 'token')).resolves.toBe(true);
    expect(checkMembershipForUser).not.toHaveBeenCalled();
    expect(getCollaboratorPermissionLevel).toHaveBeenCalledWith({ owner: 'alice', repo: 'project', username: 'bob' });
  });

  it('denies a read-only collaborator on a user repository', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'User' } });
    getCollaboratorPermissionLevel.mockResolvedValue({ data: { permission: 'pull' } });
    await expect(repository.isActorAllowedToModifyFiles('alice', 'project', 'bob', 'token')).resolves.toBe(false);
    expect(checkMembershipForUser).not.toHaveBeenCalled();
  });

  it('denies and logs an unexpected collaborator permission failure', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'User' } });
    getCollaboratorPermissionLevel.mockRejectedValue(new Error('permission service unavailable'));

    await expect(repository.isActorAllowedToModifyFiles('alice', 'project', 'bob', 'token')).resolves.toBe(false);
  });

  it('denies a collaborator when GitHub returns no permission value', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'User' } });
    getCollaboratorPermissionLevel.mockResolvedValue({ data: {} });

    await expect(repository.isActorAllowedToModifyFiles('alice', 'project', 'bob', 'token')).resolves.toBe(false);
  });

  it('does not log a missing collaborator as an unexpected permission failure', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'User' } });
    getCollaboratorPermissionLevel.mockRejectedValue({ status: 404 });

    await expect(repository.isActorAllowedToModifyFiles('alice', 'project', 'bob', 'token')).resolves.toBe(false);
  });

  it('denies when owner lookup fails', async () => {
    getByUsername.mockRejectedValue(new Error('lookup unavailable'));
    await expect(repository.isActorAllowedToModifyFiles('acme', 'project', 'alice', 'token')).resolves.toBe(false);
  });
});

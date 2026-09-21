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

  it('allows member-only automation for an organization actor when membership succeeds', async () => {
    await expect(repository.isActorAllowedToUseMemberOnlyAutomation('acme', 'project', 'alice', 'token')).resolves.toBe(true);
    expect(checkMembershipForUser).toHaveBeenCalledWith({ org: 'acme', username: 'alice' });
  });

  it('denies member-only automation when organization membership returns not found', async () => {
    checkMembershipForUser.mockRejectedValue({ status: 404 });
    await expect(repository.isActorAllowedToUseMemberOnlyAutomation('acme', 'project', 'alice', 'token')).resolves.toBe(false);
  });

  it('denies and logs unexpected membership failures', async () => {
    checkMembershipForUser.mockRejectedValue(new Error('membership unavailable'));
    await expect(repository.isActorAllowedToUseMemberOnlyAutomation('acme', 'project', 'alice', 'token')).resolves.toBe(false);
  });

  it('denies and logs a non-Error membership failure', async () => {
    checkMembershipForUser.mockRejectedValue({ status: 500, message: 'membership unavailable' });
    await expect(repository.isActorAllowedToUseMemberOnlyAutomation('acme', 'project', 'alice', 'token')).resolves.toBe(false);
  });

  it('allows organization file modification only with repository write permission', async () => {
    getCollaboratorPermissionLevel.mockResolvedValue({ data: { permission: 'push' } });

    await expect(repository.isActorAllowedToModifyFiles('acme', 'project', 'alice', 'token')).resolves.toBe(true);
    expect(getCollaboratorPermissionLevel).toHaveBeenCalledWith({ owner: 'acme', repo: 'project', username: 'alice' });
    expect(checkMembershipForUser).not.toHaveBeenCalled();
  });

  it('denies an organization member without repository write permission', async () => {
    checkMembershipForUser.mockResolvedValue({});
    getCollaboratorPermissionLevel.mockResolvedValue({ data: { permission: 'pull' } });

    await expect(repository.isActorAllowedToModifyFiles('acme', 'project', 'alice', 'token')).resolves.toBe(false);
    expect(checkMembershipForUser).not.toHaveBeenCalled();
  });

  it('allows the owner of a user repository without membership lookup', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'User' } });
    await expect(repository.isActorAllowedToModifyFiles('alice', 'project', 'alice', 'token')).resolves.toBe(true);
    expect(checkMembershipForUser).not.toHaveBeenCalled();
    expect(getCollaboratorPermissionLevel).not.toHaveBeenCalled();
  });

  it('allows member-only automation for the owner of a user repository', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'User' } });
    await expect(repository.isActorAllowedToUseMemberOnlyAutomation('alice', 'project', 'alice', 'token')).resolves.toBe(true);
    expect(getCollaboratorPermissionLevel).not.toHaveBeenCalled();
  });

  it('allows member-only automation for a write collaborator on a user repository', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'User' } });
    getCollaboratorPermissionLevel.mockResolvedValue({ data: { permission: 'maintain' } });
    await expect(repository.isActorAllowedToUseMemberOnlyAutomation('alice', 'project', 'bob', 'token')).resolves.toBe(true);
  });

  it('allows a write collaborator on a user repository', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'User' } });
    getCollaboratorPermissionLevel.mockResolvedValue({ data: { permission: 'push' } });
    await expect(repository.isActorAllowedToModifyFiles('alice', 'project', 'bob', 'token')).resolves.toBe(true);
    expect(checkMembershipForUser).not.toHaveBeenCalled();
    expect(getCollaboratorPermissionLevel).toHaveBeenCalledWith({ owner: 'alice', repo: 'project', username: 'bob' });
  });

  it('requires collaborator permission when an unsupported owner type matches the actor', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'Enterprise' } });

    await expect(repository.isActorAllowedToModifyFiles('alice', 'project', 'alice', 'token')).resolves.toBe(false);
    expect(checkMembershipForUser).not.toHaveBeenCalled();
    expect(getCollaboratorPermissionLevel).toHaveBeenCalledWith({ owner: 'alice', repo: 'project', username: 'alice' });
  });

  it('uses collaborator permission instead of membership for unknown owner types', async () => {
    getByUsername.mockResolvedValue({ data: { type: 'Unknown' } });
    getCollaboratorPermissionLevel.mockResolvedValue({ data: { permission: 'maintain' } });

    await expect(repository.isActorAllowedToUseMemberOnlyAutomation('alice', 'project', 'alice', 'token')).resolves.toBe(true);
    expect(checkMembershipForUser).not.toHaveBeenCalled();
    expect(getCollaboratorPermissionLevel).toHaveBeenCalledWith({ owner: 'alice', repo: 'project', username: 'alice' });
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

  it('denies member-only automation when owner lookup fails', async () => {
    getByUsername.mockRejectedValue(new Error('lookup unavailable'));
    await expect(repository.isActorAllowedToUseMemberOnlyAutomation('acme', 'project', 'alice', 'token')).resolves.toBe(false);
  });
});

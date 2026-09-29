import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_defaults';
import { SetupInteractionCancelledError } from '../../../errors/setup_interaction_cancelled_error';
import type { SetupRemoteConfiguration } from '../../../../domain/setup';
import {
  VerifyWebSetupApplyUseCase, type VerifyWebSetupApplyPorts, type VerifyWebSetupApplyRequest,
} from '../verify_web_setup_apply_use_case';

const repository = { owner: 'owner', repository: 'repo', checkoutRoot: '/checkout', branch: 'develop', head: 'a'.repeat(40) };
const remoteBase: SetupRemoteConfiguration = {
  ownerType: 'User', repositoryId: 42, repositoryVisibility: 'private', defaultBranch: 'main',
  repositorySecrets: ['PAT', 'OPENAI_API_KEY'], repositorySecretsAccess: 'available', organizationSecrets: [],
  repositoryVariables: [{ name: 'AGENT_PROVIDER', value: 'codex' }, { name: 'MAIN_BRANCH', value: 'main' }],
  repositoryVariablesAccess: 'available', organizationVariables: [],
  organizationAccess: 'not_applicable', organizationSecretsAccess: 'not_applicable', organizationVariablesAccess: 'not_applicable',
};
const approvedRemote = { ...remoteBase, credentialHealthWorkflow: 'installed' as const };
const request: VerifyWebSetupApplyRequest = {
  repository, selectedFiles: ['.github/workflows/copilot.yml'], fileSnapshot: { '.github/workflows/copilot.yml': 'file:abc' },
  approvedRemote, configuration: createDefaultSetupConfiguration(), setupToken: 'test-token',
};

function harness() {
  let session: 'active' | 'cancelled' | 'ended' = 'active';
  const ports: VerifyWebSetupApplyPorts = {
    confirm: jest.fn(async () => 'apply' as const),
    readRepositoryFacts: jest.fn(() => ({ ...repository })),
    fileSnapshotMatches: jest.fn(() => true),
    remote: {
      inspect: jest.fn(async () => ({ ...remoteBase })),
      inspectCredentialHealthWorkflow: jest.fn(async () => 'installed' as const),
    },
    permissionAudit: { audit: jest.fn(async () => ({ status: 'accepted' as const })) },
    sessionState: () => session,
  };
  return { ports, useCase: new VerifyWebSetupApplyUseCase(ports), setSession: (next: typeof session) => { session = next; } };
}

describe('VerifyWebSetupApplyUseCase', () => {
  test('authorizes only after reconfirming local, remote, workflow and PAT facts', async () => {
    const { ports, useCase } = harness();
    expect(await useCase.execute(request)).toBe('approved');
    expect(ports.fileSnapshotMatches).toHaveBeenCalledWith(repository.checkoutRoot, request.selectedFiles, request.fileSnapshot);
    expect(ports.readRepositoryFacts).toHaveBeenCalledTimes(2);
    expect(ports.fileSnapshotMatches).toHaveBeenCalledTimes(2);
    expect(ports.remote.inspect).toHaveBeenCalledWith('owner', 'repo', 'test-token');
    expect(ports.remote.inspectCredentialHealthWorkflow).toHaveBeenCalledWith('owner', 'repo', 'test-token', request.configuration.repository.mainBranch);
    expect(ports.permissionAudit.audit).toHaveBeenCalledWith(request.configuration, approvedRemote);
  });

  test.each([
    ['stop', 'declined'],
    [undefined, 'cancelled'],
  ] as const)('does not inspect or mutate after approval response %s', async (answer, expected) => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'confirm').mockResolvedValue(answer);
    expect(await useCase.execute(request)).toBe(expected);
    expect(ports.readRepositoryFacts).not.toHaveBeenCalled();
    expect(ports.remote.inspect).not.toHaveBeenCalled();
  });

  test.each([
    ['owner', 'different'], ['repository', 'different'], ['checkoutRoot', '/elsewhere'],
    ['branch', 'main'], ['head', 'b'.repeat(40)],
  ] as const)('fails closed when %s changed', async (field, value) => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'readRepositoryFacts').mockReturnValue({ ...repository, [field]: value });
    await expect(useCase.execute(request)).rejects.toThrow('repository identity changed');
    expect(ports.remote.inspect).not.toHaveBeenCalled();
  });

  test('fails closed when repository facts disappear', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'readRepositoryFacts').mockReturnValue(undefined);
    await expect(useCase.execute(request)).rejects.toThrow('repository identity changed');
  });

  test('fails closed on file drift before remote reads', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'fileSnapshotMatches').mockReturnValue(false);
    await expect(useCase.execute(request)).rejects.toThrow('Selected repository files changed');
    expect(ports.remote.inspect).not.toHaveBeenCalled();
  });

  test('rejects a changed HEAD after asynchronous GitHub and permission checks', async () => {
    const { ports, useCase } = harness();
    const read = jest.spyOn(ports, 'readRepositoryFacts')
      .mockReturnValueOnce({ ...repository })
      .mockReturnValue({ ...repository, head: 'b'.repeat(40) });
    await expect(useCase.execute(request)).rejects.toThrow('repository identity changed');
    expect(read).toHaveBeenCalledTimes(2);
    expect(ports.permissionAudit.audit).toHaveBeenCalledTimes(1);
  });

  test('rejects a selected-file change after asynchronous final checks', async () => {
    const { ports, useCase } = harness();
    const matches = jest.spyOn(ports, 'fileSnapshotMatches')
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    await expect(useCase.execute(request)).rejects.toThrow('Selected repository files changed');
    expect(matches).toHaveBeenCalledTimes(2);
    expect(ports.permissionAudit.audit).toHaveBeenCalledTimes(1);
  });

  test('fails closed when GitHub facts changed', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.remote, 'inspect').mockResolvedValue({ ...remoteBase, repositoryVisibility: 'public' });
    await expect(useCase.execute(request)).rejects.toThrow('GitHub repository facts changed');
    expect(ports.permissionAudit.audit).not.toHaveBeenCalled();
  });

  test('rejects a changed default branch before applying the reviewed plan', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.remote, 'inspect').mockResolvedValue({ ...remoteBase, defaultBranch: 'develop' });
    await expect(useCase.execute(request)).rejects.toThrow('GitHub repository facts changed');
    expect(ports.permissionAudit.audit).not.toHaveBeenCalled();
  });

  test('ignores response key and resource ordering when GitHub facts are unchanged', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.remote, 'inspect').mockResolvedValue({
      repositoryVariables: [...remoteBase.repositoryVariables].reverse(),
      repositorySecrets: [...remoteBase.repositorySecrets].reverse(),
      ownerType: remoteBase.ownerType, repositoryId: remoteBase.repositoryId,
      organizationSecrets: remoteBase.organizationSecrets, organizationVariables: remoteBase.organizationVariables,
      repositorySecretsAccess: remoteBase.repositorySecretsAccess,
      repositoryVariablesAccess: remoteBase.repositoryVariablesAccess,
      organizationAccess: remoteBase.organizationAccess,
      organizationSecretsAccess: remoteBase.organizationSecretsAccess,
      organizationVariablesAccess: remoteBase.organizationVariablesAccess,
      repositoryVisibility: remoteBase.repositoryVisibility,
      defaultBranch: remoteBase.defaultBranch,
    });
    expect(await useCase.execute(request)).toBe('approved');
  });

  test('fails closed when a remote variable value changes', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.remote, 'inspect').mockResolvedValue({
      ...remoteBase, repositoryVariables: [{ name: 'AGENT_PROVIDER', value: 'cursor' }, ...remoteBase.repositoryVariables.slice(1)],
    });
    await expect(useCase.execute(request)).rejects.toThrow('GitHub repository facts changed');
    expect(ports.permissionAudit.audit).not.toHaveBeenCalled();
  });

  test('unknown selected-ref workflow state cannot inherit earlier installed evidence', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.remote, 'inspectCredentialHealthWorkflow').mockRejectedValue(new Error('read failed'));
    await expect(useCase.execute(request)).rejects.toThrow('GitHub repository facts changed');
    expect(ports.permissionAudit.audit).not.toHaveBeenCalled();
  });

  test('treats an unavailable workflow inspection port as unknown rather than reusing stale evidence', async () => {
    const { ports, useCase } = harness();
    delete (ports.remote as { inspectCredentialHealthWorkflow?: unknown }).inspectCredentialHealthWorkflow;
    await expect(useCase.execute(request)).rejects.toThrow('GitHub repository facts changed');
    expect(ports.permissionAudit.audit).not.toHaveBeenCalled();
  });

  test('blocks when the final PAT audit loses a required grant', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.permissionAudit, 'audit').mockResolvedValue({ status: 'blocked', errors: ['missing'] });
    await expect(useCase.execute(request)).rejects.toThrow('Setup PAT access changed');
  });

  test.each(['cancelled', 'ended'] as const)('stops before facts are read when session is %s', async state => {
    const { ports, useCase, setSession } = harness();
    setSession(state);
    await expect(useCase.execute(request)).rejects.toThrow(state === 'cancelled' ? SetupInteractionCancelledError : 'session expired');
    expect(ports.readRepositoryFacts).not.toHaveBeenCalled();
  });

  test('cancellation arriving during remote inspection wins before another read', async () => {
    const { ports, useCase, setSession } = harness();
    jest.spyOn(ports.remote, 'inspect').mockImplementation(async () => { setSession('cancelled'); return remoteBase; });
    await expect(useCase.execute(request)).rejects.toThrow(SetupInteractionCancelledError);
    expect(ports.remote.inspectCredentialHealthWorkflow).not.toHaveBeenCalled();
  });

  test('expiry arriving during the final audit prevents approval', async () => {
    const { ports, useCase, setSession } = harness();
    jest.spyOn(ports.permissionAudit, 'audit').mockImplementation(async () => { setSession('ended'); return { status: 'accepted' }; });
    await expect(useCase.execute(request)).rejects.toThrow('session expired');
  });
});

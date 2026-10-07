import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_defaults';
import { buildSetupPatIntentPermissionRequirements, buildSetupPatPermissionRequirements } from '../../../policies/setup_token_permission_policy';
import type { SetupRemoteConfiguration } from '../../../../domain/setup';
import type { SetupTokenPermissionReport } from '../../../../domain/setup_token_permissions';
import { AuditConfiguredSetupPatUseCase, type AuditConfiguredSetupPatPorts } from '../audit_configured_setup_pat_use_case';

const remote: SetupRemoteConfiguration = {
  ownerType: 'Organization', repositoryId: 42, repositoryVisibility: 'private',
  repositorySecrets: [], repositorySecretsAccess: 'available', organizationSecrets: [],
  repositoryVariables: [], repositoryVariablesAccess: 'available', organizationVariables: [],
  organizationAccess: 'available', organizationSecretsAccess: 'available', organizationVariablesAccess: 'available',
};
const report: SetupTokenPermissionReport = {
  role: 'setup', account: 'operator', identityStatus: 'valid', identityMessage: 'valid',
  checks: [], ready: true, confirmationRequired: false,
};

function harness(options: { token?: string; guided?: boolean; assertedOwnerKind?: 'Organization' | 'User' } = {}) {
  const provisionalRequirements = buildSetupPatPermissionRequirements();
  const ports: AuditConfiguredSetupPatPorts = {
    permissions: { inspect: jest.fn(async () => report) },
    presenter: { showRequirements: jest.fn(), showReport: jest.fn() },
    confirmUnverifiable: jest.fn(async () => true),
    showOwnerMismatch: jest.fn(), showExcessGrants: jest.fn(), showUpdatedLink: jest.fn(),
  };
  const context = {
    owner: 'owner', repository: 'repo', provisionalRequirements,
    token: options.token, guided: options.guided ?? false, assertedOwnerKind: options.assertedOwnerKind,
  };
  return { context, ports, useCase: new AuditConfiguredSetupPatUseCase(context, ports) };
}

describe('AuditConfiguredSetupPatUseCase', () => {
  const configuration = createDefaultSetupConfiguration();

  test('reports final grants and audits the supplied PAT without mutations', async () => {
    const { ports, useCase } = harness({ token: 'test-token' });
    expect(await useCase.audit(configuration, remote)).toEqual({ status: 'accepted' });
    expect(ports.permissions.inspect).toHaveBeenCalledWith(expect.objectContaining({
      role: 'setup', owner: 'owner', repository: 'repo', token: 'test-token', requirements: expect.any(Array),
    }));
    expect(ports.presenter.showRequirements).toHaveBeenCalledWith('setup', expect.any(Array));
    expect(ports.presenter.showReport).toHaveBeenCalledWith(report);
    expect(ports.confirmUnverifiable).not.toHaveBeenCalled();
  });

  test('passes approved Project numbers to the exact-resource read audit', async () => {
    const { ports, useCase } = harness({ token: 'test-token' });
    const selected = { ...configuration, projects: { ...configuration.projects, ids: '7,9' } };
    expect(await useCase.audit(selected, remote)).toEqual({ status: 'accepted' });
    expect(ports.permissions.inspect).toHaveBeenCalledWith(expect.objectContaining({
      selectedProjectNumbers: '7,9',
    }));
  });

  test('preview without a PAT shows requirements but never probes permissions', async () => {
    const { ports, useCase } = harness();
    expect(await useCase.audit(configuration, remote)).toEqual({ status: 'accepted' });
    expect(ports.permissions.inspect).not.toHaveBeenCalled();
    expect(ports.presenter.showRequirements).toHaveBeenCalled();
  });

  test('owner mismatch blocks before probing and offers a corrected link', async () => {
    const { ports, useCase } = harness({ token: 'test-token', guided: true, assertedOwnerKind: 'User' });
    expect(await useCase.audit(configuration, remote)).toEqual(expect.objectContaining({ status: 'blocked' }));
    expect(ports.showOwnerMismatch).toHaveBeenCalledWith('User', 'Organization');
    expect(ports.showUpdatedLink).toHaveBeenCalledWith(expect.stringContaining('target_name=owner'), expect.any(Array));
    expect(ports.permissions.inspect).not.toHaveBeenCalled();
  });

  test.each(['Organization', 'User'] as const)('unknown owner type blocks token-backed audit despite %s assertion', async assertedOwnerKind => {
    const { ports, useCase } = harness({ token: 'test-token', guided: true, assertedOwnerKind });
    const result = await useCase.audit(configuration, { ...remote, ownerType: 'Unknown' });
    expect(result).toEqual({ status: 'blocked', errors: [expect.stringContaining('could not verify')] });
    expect(ports.showOwnerMismatch).not.toHaveBeenCalled();
    expect(ports.showUpdatedLink).not.toHaveBeenCalled();
    expect(ports.permissions.inspect).not.toHaveBeenCalled();
    expect(ports.presenter.showRequirements).toHaveBeenCalledWith('setup', expect.arrayContaining([
      expect.objectContaining({ scope: 'organization', permission: 'Issue Types' }),
    ]));
  });

  test('unavailable owner inspection blocks a token-backed audit before permission probes', async () => {
    const { ports, useCase } = harness({ token: 'test-token' });
    expect(await useCase.audit(configuration)).toEqual({
      status: 'blocked', errors: [expect.stringContaining('could not verify')],
    });
    expect(ports.permissions.inspect).not.toHaveBeenCalled();
  });

  test('dry-run preview without a token may show unknown owner grants without authorizing mutations', async () => {
    const { ports, useCase } = harness({ assertedOwnerKind: 'User' });
    expect(await useCase.audit(configuration, { ...remote, ownerType: 'Unknown' })).toEqual({ status: 'accepted' });
    expect(ports.permissions.inspect).not.toHaveBeenCalled();
    expect(ports.showOwnerMismatch).not.toHaveBeenCalled();
  });

  test('guided review explains grants removed from the provisional link', async () => {
    const { context, ports, useCase } = harness({ guided: true });
    const secrets = context.provisionalRequirements.find(item => item.permission === 'Secrets' && item.scope === 'repository')!;
    context.provisionalRequirements = [...context.provisionalRequirements, { ...secrets, applicability: 'required' }];
    const minimal = createDefaultSetupConfiguration();
    minimal.manageRepositorySecrets = false;
    minimal.manageRepositoryVariables = false;
    minimal.issueWorkflows.enabled = [];
    minimal.createInitialTag = false;
    for (const feature of Object.keys(minimal.features)) minimal.features[feature] = false;
    minimal.pullRequestApproval = { ...minimal.pullRequestApproval, mode: 'off' };
    expect(await useCase.audit(minimal, remote)).toEqual({ status: 'accepted' });
    expect(ports.showExcessGrants).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining('Secrets')]));
  });

  test('unverifiable writes block even if legacy confirmation is offered', async () => {
    const { ports, useCase } = harness({ token: 'test-token' });
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false, confirmationRequired: true });
    expect(await useCase.audit(configuration, remote)).toEqual(expect.objectContaining({ status: 'blocked' }));
    expect(ports.confirmUnverifiable).not.toHaveBeenCalled();
  });

  test('declined unverifiable writes block the final plan', async () => {
    const { ports, useCase } = harness({ token: 'test-token', guided: true });
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false, confirmationRequired: true });
    jest.spyOn(ports, 'confirmUnverifiable').mockResolvedValue(false);
    expect(await useCase.audit(configuration, remote)).toEqual(expect.objectContaining({ status: 'blocked' }));
    expect(ports.showUpdatedLink).toHaveBeenCalledTimes(1);
  });

  test.each(['invalid', 'unverifiable'] as const)('%s PAT identity blocks even when checks are otherwise ready', async identityStatus => {
    const { ports, useCase } = harness({ token: 'test-token', guided: false });
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, identityStatus });
    expect(await useCase.audit(configuration, remote)).toEqual(expect.objectContaining({ status: 'blocked' }));
    expect(ports.showUpdatedLink).not.toHaveBeenCalled();
  });

  test('missing required access blocks and offers a new guided link', async () => {
    const { ports, useCase } = harness({ token: 'test-token', guided: true });
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false });
    expect(await useCase.audit(configuration, remote)).toEqual(expect.objectContaining({ status: 'blocked' }));
    expect(ports.showUpdatedLink).toHaveBeenCalledWith(expect.stringContaining('https://github.com/settings/personal-access-tokens/new?'), expect.any(Array));
  });

  test('a missing health workflow adds Workflows write to the corrected guided link after inspection', async () => {
    const { context, ports, useCase } = harness({ token: 'test-token', guided: true });
    expect(context.provisionalRequirements.some(item => item.permission === 'Workflows' && item.applicability === 'required')).toBe(false);
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false });
    expect(await useCase.audit(configuration, { ...remote, repositorySecrets: ['CODEX_API_KEY'], credentialHealthWorkflow: 'missing' }))
      .toEqual(expect.objectContaining({ status: 'blocked' }));
    expect(ports.showUpdatedLink).toHaveBeenCalledWith(expect.stringContaining('workflows=write'),
      expect.arrayContaining(['repository Workflows write']));
    expect(ports.permissions.inspect).toHaveBeenCalledWith(expect.objectContaining({
      requirements: expect.arrayContaining([expect.objectContaining({ permission: 'Workflows', level: 'write', applicability: 'required' })]),
    }));
  });

  test('unused prefilled health writes are reported as possible excess access without being audited', async () => {
    const { context, ports, useCase } = harness({ token: 'test-token', guided: true });
    const selected = createDefaultSetupConfiguration();
    selected.pullRequestApproval = { ...selected.pullRequestApproval, mode: 'recommend' };
    selected.createInitialTag = false;
    context.provisionalRequirements = buildSetupPatIntentPermissionRequirements(selected, 'Organization');
    expect(await useCase.audit(selected, remote)).toEqual({ status: 'accepted' });
    expect(ports.showExcessGrants).toHaveBeenCalledWith(expect.arrayContaining([
      'repository Actions write', 'repository Contents write', 'repository Workflows write',
    ]));
    const inspected = jest.mocked(ports.permissions.inspect).mock.calls[0][0].requirements;
    expect(inspected.some(item => item.permission === 'Workflows')).toBe(false);
    expect(inspected.filter(item => item.permission === 'Actions')).toEqual([
      expect.objectContaining({ level: 'read', applicability: 'required' }),
    ]);
  });

  test('final discovered health needs still require audited write proof despite being prefilled initially', async () => {
    const { context, ports, useCase } = harness({ token: 'test-token', guided: true });
    context.provisionalRequirements = buildSetupPatIntentPermissionRequirements(configuration, 'Organization');
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false });
    expect(await useCase.audit(configuration, { ...remote, repositorySecrets: ['CODEX_API_KEY'], credentialHealthWorkflow: 'missing' }))
      .toEqual(expect.objectContaining({ status: 'blocked' }));
    const inspected = jest.mocked(ports.permissions.inspect).mock.calls[0][0].requirements;
    for (const permission of ['Actions', 'Contents', 'Workflows']) {
      expect(inspected).toEqual(expect.arrayContaining([expect.objectContaining({ permission, level: 'write', applicability: 'required' })]));
    }
    expect(ports.showUpdatedLink).toHaveBeenCalledWith(expect.stringContaining('actions=write'), expect.any(Array));
  });

  test('surfaces unconfirmed temporary cleanup and marks the session as possibly changed', async () => {
    const { ports, useCase } = harness({ token: 'test-token' });
    const onCleanupPending = jest.fn();
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false, checks: [{
      id: 'setup:repository:actions:write', role: 'setup', scope: 'repository', permission: 'Actions',
      level: 'write', applicability: 'required', reason: 'fixture', probe: 'actions',
      status: 'unverifiable', message: 'cleanup failed', cleanupPending: true,
    }] });
    expect(await useCase.audit(configuration, remote, onCleanupPending)).toEqual({
      status: 'blocked', cleanupPending: true,
      errors: [expect.stringContaining('may have left a resource or changed a concurrent Secret')],
    });
    expect(onCleanupPending).toHaveBeenCalledTimes(1);
  });
});

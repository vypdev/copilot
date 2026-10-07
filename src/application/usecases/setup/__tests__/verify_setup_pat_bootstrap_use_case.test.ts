import type { SetupTokenPermissionReport } from '../../../../domain/setup_token_permissions';
import { buildSetupPatIntentPermissionRequirements, buildSetupPatPermissionRequirements } from '../../../policies/setup_token_permission_policy';
import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_defaults';
import { VerifySetupPatBootstrapUseCase, type VerifySetupPatBootstrapPorts } from '../verify_setup_pat_bootstrap_use_case';

const report: SetupTokenPermissionReport = {
  role: 'setup', account: 'operator', identityStatus: 'valid', identityMessage: 'valid', checks: [],
  ready: true, confirmationRequired: false,
};
const request = {
  owner: 'owner', repository: 'repo', token: 'test-token',
  requirements: buildSetupPatIntentPermissionRequirements(createDefaultSetupConfiguration(), 'Organization')
    .filter(item => item.applicability === 'required'), guided: true,
};

function harness() {
  const ports: VerifySetupPatBootstrapPorts = {
    permissions: { inspect: jest.fn(async () => report) },
    presenter: { showRequirements: jest.fn(), showReport: jest.fn() },
    confirmUnverifiable: jest.fn(async () => true),
    confirmAccount: jest.fn(async () => true),
    showCorrectedLink: jest.fn(),
  };
  return { ports, useCase: new VerifySetupPatBootstrapUseCase(ports) };
}

describe('VerifySetupPatBootstrapUseCase', () => {
  test('audits capabilities and returns the authenticated operator account', async () => {
    const { ports, useCase } = harness();
    expect(await useCase.execute(request)).toBe('operator');
    expect(ports.permissions.inspect).toHaveBeenNthCalledWith(1, {
      role: 'setup', owner: 'owner', repository: 'repo', token: 'test-token',
      requirements: request.requirements.filter(requirement => requirement.level === 'read'),
    });
    expect(ports.permissions.inspect).toHaveBeenNthCalledWith(2, {
      role: 'setup', owner: 'owner', repository: 'repo', token: 'test-token',
      requirements: request.requirements, includeConditionalWrites: true,
    });
    expect(ports.presenter.showReport).toHaveBeenCalledWith(report);
    expect(ports.confirmAccount).toHaveBeenCalledWith('operator');
    expect(ports.confirmUnverifiable).not.toHaveBeenCalled();
  });

  test('blocks unverifiable write grants even if legacy confirmation is offered', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false, confirmationRequired: true });
    await expect(useCase.execute(request)).rejects.toThrow('did not pass every required capability check');
    expect(ports.confirmUnverifiable).not.toHaveBeenCalled();
  });

  test('declined unverifiable grants block before account confirmation', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false, confirmationRequired: true });
    jest.spyOn(ports, 'confirmUnverifiable').mockResolvedValue(false);
    await expect(useCase.execute(request)).rejects.toThrow('did not pass every required capability check');
    expect(ports.showCorrectedLink).toHaveBeenCalledWith(expect.stringContaining('target_name=owner'));
    expect(ports.confirmAccount).not.toHaveBeenCalled();
  });

  test.each(['invalid', 'unverifiable'] as const)('%s identity blocks regardless of a ready permission table', async identityStatus => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, identityStatus });
    await expect(useCase.execute(request)).rejects.toThrow('did not pass every required capability check');
    expect(ports.confirmAccount).not.toHaveBeenCalled();
  });

  test('manual PAT failure does not imply a guided correction URL', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false });
    await expect(useCase.execute({ ...request, guided: false })).rejects.toThrow('did not pass every required capability check');
    expect(ports.showCorrectedLink).not.toHaveBeenCalled();
  });

  test('operator rejects an authenticated but unintended account', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'confirmAccount').mockResolvedValue(false);
    await expect(useCase.execute(request)).rejects.toThrow('unintended account');
    expect(ports.showCorrectedLink).not.toHaveBeenCalled();
    expect(ports.permissions.inspect).toHaveBeenCalledTimes(1);
  });

  test('confirms the account before any write inspection', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.permissions, 'inspect').mockImplementation(async input => {
      if (input.includeConditionalWrites) {
        expect(ports.confirmAccount).toHaveBeenCalledWith('operator');
        expect(ports.presenter.showRequirements).toHaveBeenCalledWith('setup', request.requirements);
      }
      return report;
    });
    await useCase.execute(request);
  });

  test.each([true, false])('preview=%s preserves original requirements without write deferral', async previewOnly => {
    const { ports, useCase } = harness();
    const original = JSON.stringify(request.requirements);
    await useCase.execute({ ...request, previewOnly });
    expect(ports.permissions.inspect).toHaveBeenCalledTimes(previewOnly ? 1 : 2);
    expect(JSON.stringify(request.requirements)).toBe(original);
  });

  test('a read-only request needs only one inspection', async () => {
    const { ports, useCase } = harness();
    await useCase.execute({ ...request, requirements: request.requirements.filter(item => item.level === 'read') });
    expect(ports.permissions.inspect).toHaveBeenCalledTimes(1);
  });

  test('failed required writes block during initial PAT verification', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValueOnce(report).mockResolvedValueOnce({ ...report, ready: false });
    await expect(useCase.execute(request)).rejects.toThrow('did not pass every required capability check');
    expect(ports.confirmAccount).toHaveBeenCalled();
    expect(ports.confirmUnverifiable).not.toHaveBeenCalled();
  });

  test.each(['cleanup', 'collision'] as const)('pending %s in a required write blocks and marks partial effects', async kind => {
    const { ports, useCase } = harness();
    const onCleanupPending = jest.fn();
    const requirement = request.requirements.find(item => item.probe === 'secrets')!;
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValueOnce(report).mockResolvedValueOnce({ ...report,
      checks: [{ ...requirement, status: 'unverifiable', message: 'pending', cleanupPending: true,
        ...(kind === 'collision' ? { incident: 'secret-collision' as const } : {}) }],
    });
    await expect(useCase.execute({ ...request, onCleanupPending })).rejects.toThrow('did not pass');
    expect(onCleanupPending).toHaveBeenCalledTimes(1);
  });

  test('guided bootstrap defers prefilled health writes until the final plan resolves their conditions', async () => {
    const { ports, useCase } = harness();
    const configuration = createDefaultSetupConfiguration();
    configuration.createInitialTag = false;
    const requirements = buildSetupPatIntentPermissionRequirements(configuration, 'Organization');
    await useCase.execute({ ...request, requirements });
    const inspected = jest.mocked(ports.permissions.inspect).mock.calls.flatMap(([input]) => input.requirements);
    expect(inspected.some(item => item.applicability === 'conditional')).toBe(false);
    expect(inspected.filter(item => item.level === 'write' && ['Actions', 'Contents', 'Workflows'].includes(item.permission)))
      .toEqual([]);
    expect(ports.permissions.inspect).toHaveBeenCalledTimes(2);
  });

  test('manual bootstrap still inspects displayed conditional writes after account confirmation', async () => {
    const { ports, useCase } = harness();
    const requirements = buildSetupPatPermissionRequirements();
    await useCase.execute({ ...request, requirements, guided: false });
    expect(ports.permissions.inspect).toHaveBeenNthCalledWith(2, expect.objectContaining({
      requirements, includeConditionalWrites: true,
    }));
    expect(ports.confirmAccount).toHaveBeenCalledWith('operator');
  });

  test('a failed guided bootstrap keeps health prerequisites in its corrected creation link', async () => {
    const { ports, useCase } = harness();
    const requirements = buildSetupPatIntentPermissionRequirements(createDefaultSetupConfiguration(), 'Organization');
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false });
    await expect(useCase.execute({ ...request, requirements })).rejects.toThrow('did not pass');
    const url = new URL(jest.mocked(ports.showCorrectedLink).mock.calls[0][0]);
    expect(url.searchParams.get('actions')).toBe('write');
    expect(url.searchParams.get('workflows')).toBe('write');
  });
});

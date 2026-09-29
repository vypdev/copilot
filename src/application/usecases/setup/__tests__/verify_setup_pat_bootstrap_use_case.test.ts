import type { SetupTokenPermissionReport } from '../../../../domain/setup_token_permissions';
import { buildSetupPatPermissionRequirements } from '../../../policies/setup_token_permission_policy';
import { VerifySetupPatBootstrapUseCase, type VerifySetupPatBootstrapPorts } from '../verify_setup_pat_bootstrap_use_case';

const report: SetupTokenPermissionReport = {
  role: 'setup', account: 'operator', identityStatus: 'valid', identityMessage: 'valid', checks: [],
  ready: true, confirmationRequired: false,
};
const request = {
  owner: 'owner', repository: 'repo', token: 'test-token', requirements: buildSetupPatPermissionRequirements(), guided: true,
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
  test('audits read-only and returns the authenticated operator account', async () => {
    const { ports, useCase } = harness();
    expect(await useCase.execute(request)).toBe('operator');
    expect(ports.permissions.inspect).toHaveBeenCalledWith({
      role: 'setup', owner: 'owner', repository: 'repo', token: 'test-token', requirements: request.requirements,
    });
    expect(ports.presenter.showReport).toHaveBeenCalledWith(report);
    expect(ports.confirmAccount).toHaveBeenCalledWith('operator');
    expect(ports.confirmUnverifiable).not.toHaveBeenCalled();
  });

  test('requires explicit confirmation for unverifiable write grants', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false, confirmationRequired: true });
    expect(await useCase.execute(request)).toBe('operator');
    expect(ports.confirmUnverifiable).toHaveBeenCalledTimes(1);
  });

  test('declined unverifiable grants block before account confirmation', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false, confirmationRequired: true });
    jest.spyOn(ports, 'confirmUnverifiable').mockResolvedValue(false);
    await expect(useCase.execute(request)).rejects.toThrow('missing or unconfirmed required access');
    expect(ports.showCorrectedLink).toHaveBeenCalledWith(expect.stringContaining('target_name=owner'));
    expect(ports.confirmAccount).not.toHaveBeenCalled();
  });

  test.each(['invalid', 'unverifiable'] as const)('%s identity blocks regardless of a ready permission table', async identityStatus => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, identityStatus });
    await expect(useCase.execute(request)).rejects.toThrow('missing or unconfirmed required access');
    expect(ports.confirmAccount).not.toHaveBeenCalled();
  });

  test('manual PAT failure does not imply a guided correction URL', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports.permissions, 'inspect').mockResolvedValue({ ...report, ready: false });
    await expect(useCase.execute({ ...request, guided: false })).rejects.toThrow('missing or unconfirmed required access');
    expect(ports.showCorrectedLink).not.toHaveBeenCalled();
  });

  test('operator rejects an authenticated but unintended account', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'confirmAccount').mockResolvedValue(false);
    await expect(useCase.execute(request)).rejects.toThrow('unintended account');
    expect(ports.showCorrectedLink).not.toHaveBeenCalled();
  });
});

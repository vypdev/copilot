import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupWizardUseCase } from '../setup_wizard_use_case';
import { inspectSetupInstallation } from '../../../../utils/setup_installation_review';
import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_defaults';
describe('verification onboarding no-write exits', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(join(tmpdir(), 'copilot-verification-preview-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  test.each(['approved', 'declined', 'cancelled'] as const)('VSO-07 %s preview never creates a starter or runs permission writes', async kind => {
    const audit = jest.fn(); const present = jest.fn();
    const usecase = new SetupWizardUseCase({ planPresenter: { present }, confirmation: { confirm: async () => ({ kind }) },
      finalPermissionAudit: { audit }, installationReview: { inspect: async configuration => inspectSetupInstallation(root, configuration) } });
    const config = createDefaultSetupConfiguration(); config.repository.verificationSetup = true; config.pullRequestApproval = { ...config.pullRequestApproval, mode: 'off' };
    const result = await usecase.execute({ mode: 'non-interactive', previewOnly: true, skipRepositoryVariables: true, skipRepositorySecrets: true, overrides: config });
    expect(result.status).toBe(kind === 'approved' ? 'completed' : 'cancelled');
    expect(present.mock.calls[0][0].installationReview.verificationSetup).toMatchObject({ action: 'create', enabled: true });
    expect(audit).not.toHaveBeenCalled(); expect(fs.readdirSync(root)).toEqual([]);
  });
});

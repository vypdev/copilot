import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import { buildSetupPatCreationUrl } from '../setup_pat_creation_url_policy';
import {
  buildConfiguredSetupPatPermissionRequirements,
  buildSetupPatIntentPermissionRequirements,
} from '../setup_token_permission_policy';

describe('approval setup operator permissions', () => {
  test.each(['off', 'recommend', 'guarded'] as const)(
    '%s intent requests Checks only for guarded approval', mode => {
      const configuration = createDefaultSetupConfiguration();
      configuration.manageRepositorySecrets = false;
      configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode };
      const requirements = buildSetupPatIntentPermissionRequirements(configuration, 'Organization');
      const url = new URL(buildSetupPatCreationUrl({
        role: 'setup', owner: 'owner', repository: 'repo', expiresIn: 1, requirements,
      }));

      expect(requirements.some(item => item.permission === 'Checks')).toBe(mode === 'guarded');
      expect(url.searchParams.get('checks')).toBe(mode === 'guarded' ? 'read' : null);
      expect(requirements.some(item => item.permission === 'Actions' && item.level === 'read'))
        .toBe(mode !== 'off');
    },
  );

  test.each(['off', 'recommend', 'guarded'] as const)(
    '%s final audit requests Checks only for guarded approval', mode => {
      const configuration = createDefaultSetupConfiguration();
      configuration.manageRepositorySecrets = false;
      configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode };
      const requirements = buildConfiguredSetupPatPermissionRequirements(configuration);

      expect(requirements.some(item => item.permission === 'Checks')).toBe(mode === 'guarded');
      expect(requirements.some(item => item.permission === 'Actions' && item.level === 'read'))
        .toBe(mode !== 'off');
    },
  );
});

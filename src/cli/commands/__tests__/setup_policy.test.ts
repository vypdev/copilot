import { ACTIONS, INPUT_KEYS } from '../../../utils/constants';
import { buildSetupParams } from '../setup_policy';

const gitInfo = { owner: 'owner', repo: 'repo' } as const;

describe('setup command policy', () => {
  it('builds the initial setup action with repository and token context', () => {
    const params = buildSetupParams({ debug: true }, gitInfo, 'token');
    expect(params).toMatchObject({
      [INPUT_KEYS.DEBUG]: 'true',
      [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.INITIAL_SETUP,
      [INPUT_KEYS.TOKEN]: 'token',
      repo: gitInfo,
      issue: { number: 1 },
    });
    expect(params[INPUT_KEYS.WELCOME_MESSAGES]).toHaveLength(2);
  });

  it('does not build params for an invalid git context', () => {
    expect(buildSetupParams({}, { error: 'missing' }, 'token')).toBeUndefined();
  });
});

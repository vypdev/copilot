import { INPUT_KEYS } from '../../application/contracts/input_keys';
import { readGithubActionLocaleInputs } from '../github_action_locale_inputs';

function reader(values: Record<string, string>) {
  return (key: string) => values[key] ?? '';
}

describe('readGithubActionLocaleInputs', () => {
  it('uses en-US as the universal default', () => {
    expect(readGithubActionLocaleInputs(reader({}))).toEqual({
      repository: 'en-US', issue: 'en-US', pullRequest: 'en-US',
    });
  });

  it('inherits the repository locale when surface overrides are empty', () => {
    expect(readGithubActionLocaleInputs(reader({ [INPUT_KEYS.REPOSITORY_LOCALE]: 'fr-fr' }))).toEqual({
      repository: 'fr-FR', issue: 'fr-FR', pullRequest: 'fr-FR',
    });
  });

  it('preserves explicit surface configuration as overrides', () => {
    expect(readGithubActionLocaleInputs(reader({
      [INPUT_KEYS.REPOSITORY_LOCALE]: 'en-US',
      [INPUT_KEYS.ISSUES_LOCALE]: 'es-ES',
      [INPUT_KEYS.PULL_REQUESTS_LOCALE]: 'de-DE',
    }))).toEqual({
      repository: 'en-US', issue: 'es-ES', pullRequest: 'de-DE',
      issueOverride: 'es-ES', pullRequestOverride: 'de-DE',
    });
  });

  it('rejects malformed configuration before any workflow can mutate GitHub', () => {
    expect(() => readGithubActionLocaleInputs(reader({
      [INPUT_KEYS.REPOSITORY_LOCALE]: 'pt_BR',
    }))).toThrow('Invalid locale tag');
  });
});

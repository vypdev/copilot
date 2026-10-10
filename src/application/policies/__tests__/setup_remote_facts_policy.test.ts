import type { SetupRemoteConfiguration } from '../../../domain/setup';
import { sameSetupRemoteFacts } from '../setup_remote_facts_policy';

const facts: SetupRemoteConfiguration = {
  ownerType: 'Organization', repositoryId: 5, repositoryVisibility: 'private', defaultBranch: 'main',
  repositorySecrets: ['PAT', 'OPENAI_API_KEY'], repositorySecretsAccess: 'available',
  organizationSecrets: ['EXISTING'],
  repositoryVariables: [{ name: 'MAIN_BRANCH', value: 'main' }, { name: 'AGENT_PROVIDER', value: 'codex' }],
  repositoryVariablesAccess: 'available', organizationVariables: [{ name: 'CUSTOM', value: 'one' }],
  organizationAccess: 'available', organizationSecretsAccess: 'available', organizationVariablesAccess: 'available',
  credentialHealthWorkflow: 'installed',
};

describe('setup remote fact equivalence', () => {
  test('resource ordering is immaterial', () => {
    expect(sameSetupRemoteFacts(facts, {
      ...facts, repositorySecrets: [...facts.repositorySecrets].reverse(),
      repositoryVariables: [...facts.repositoryVariables].reverse(),
    })).toBe(true);
  });

  test.each([
    ['ownerType', 'User'], ['repositoryId', 6], ['repositoryVisibility', 'public'], ['defaultBranch', 'develop'],
    ['repositorySecrets', []], ['repositorySecretsAccess', 'unknown'], ['organizationSecrets', []],
    ['repositoryVariablesAccess', 'unavailable'], ['organizationVariables', []],
    ['organizationAccess', 'unknown'], ['organizationSecretsAccess', 'unknown'],
    ['organizationVariablesAccess', 'unknown'], ['credentialHealthWorkflow', 'missing'],
  ] as const)('detects a change in %s', (field, value) => {
    expect(sameSetupRemoteFacts(facts, { ...facts, [field]: value })).toBe(false);
  });

  test('detects a changed variable value even with the same name', () => {
    expect(sameSetupRemoteFacts(facts, {
      ...facts, repositoryVariables: [{ name: 'MAIN_BRANCH', value: 'develop' }, facts.repositoryVariables[1]],
    })).toBe(false);
  });
});

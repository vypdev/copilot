import type { SetupRemoteConfiguration } from '../../../domain/setup';
import { sameSetupRemoteFacts } from '../setup_remote_facts_policy';

const facts: SetupRemoteConfiguration = {
  ownerType: 'Organization', repositoryId: 5, repositoryVisibility: 'private', defaultBranch: 'main',
  repositorySecretRevisions: ['PAT', 'OPENAI_API_KEY'].map(name => ({ name, updatedAt: '2026-10-17T00:00:00Z' })),
  repositorySecrets: ['PAT', 'OPENAI_API_KEY'], repositorySecretsAccess: 'available',
  organizationSecrets: ['EXISTING'], organizationSecretRevisions: [{ name: 'EXISTING', updatedAt: '2026-10-17T00:00:00Z' }],
  repositoryVariables: [{ name: 'MAIN_BRANCH', value: 'main' }, { name: 'AGENT_PROVIDER', value: 'codex' }],
  repositoryVariablesAccess: 'available', organizationVariables: [{ name: 'CUSTOM', value: 'one' }],
  organizationAccess: 'available', organizationSecretsAccess: 'available', organizationVariablesAccess: 'available',
  credentialHealthWorkflow: 'installed',
};

describe('setup remote fact equivalence', () => {
  test.each(['repositorySecretRevisions', 'organizationSecretRevisions'] as const)('does not equate two missing %s snapshots', field => {
    const unknown = { ...facts, [field]: undefined };
    expect(sameSetupRemoteFacts(unknown, unknown)).toBe(false);
    expect(sameSetupRemoteFacts(facts, unknown)).toBe(false);
    expect(sameSetupRemoteFacts(unknown, facts)).toBe(false);
  });
  test.each([
    [], [{ name: 'OTHER', updatedAt: '2026-10-17T00:00:00Z' }],
    [{ name: 'PAT', updatedAt: 'invalid' }, { name: 'OPENAI_API_KEY', updatedAt: '2026-10-17T00:00:00Z' }],
    [{ name: 'PAT', updatedAt: '2026-10-17T00:00:00Z' }, { name: 'PAT', updatedAt: '2026-10-17T00:00:00Z' }],
  ].map(repositorySecretRevisions => ({ repositorySecretRevisions })))('rejects incomplete or malformed Secret revisions %#', ({ repositorySecretRevisions }) => {
    const invalid = { ...facts, repositorySecretRevisions };
    expect(sameSetupRemoteFacts(invalid, invalid)).toBe(false);
  });
  test('accepts a proven empty namespace without requiring invented timestamps', () => {
    const empty = { ...facts, repositorySecrets: [], organizationSecrets: [], repositorySecretRevisions: undefined, organizationSecretRevisions: [] };
    expect(sameSetupRemoteFacts(empty, empty)).toBe(true);
    expect(sameSetupRemoteFacts({ ...empty, repositorySecretRevisions: facts.repositorySecretRevisions }, empty)).toBe(false);
  });
  test('rejects ambiguous native names even when revisions repeat them', () => {
    const invalid = { ...facts, repositorySecrets: ['PAT', 'PAT'], repositorySecretRevisions: [facts.repositorySecretRevisions![0], facts.repositorySecretRevisions![0]] };
    expect(sameSetupRemoteFacts(invalid, invalid)).toBe(false);
  });
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


test('repository Secret rotations invalidate effective configuration freshness', () => {
  const empty = { ownerType: 'Organization', repositoryVisibility: 'private', repositorySecrets: ['PAT'], repositorySecretsAccess: 'available',
    repositoryVariables: [], repositoryVariablesAccess: 'available', organizationSecrets: [], organizationVariables: [], organizationAccess: 'available', organizationSecretsAccess: 'available', organizationVariablesAccess: 'available' } as import('../../../domain/setup').SetupRemoteConfiguration;
  const original = { ...empty, repositorySecretRevisions: [{ name: 'PAT', updatedAt: '2026-10-17T00:00:00Z' }] };
  expect(sameSetupRemoteFacts(original, { ...original, repositorySecretRevisions: [{ name: 'PAT', updatedAt: '2026-10-17T00:01:00Z' }] })).toBe(false);
  expect(sameSetupRemoteFacts(original, { ...original })).toBe(true);
});

import type { SetupConfiguration, SetupRemoteConfiguration, SetupVariable } from '../../../domain/setup';
import { createDefaultSetupConfiguration, SETUP_AGENT_TASKS } from '../setup_configuration_defaults';
import { buildSetupRepositoryVariables } from '../setup_configuration_plan';
import { importSetupOrganizationConfiguration } from '../setup_organization_import_policy';

function remote(variables: readonly SetupVariable[] = [], overrides: Partial<SetupRemoteConfiguration> = {}): SetupRemoteConfiguration {
  return { ownerType: 'Organization', defaultBranch: 'master', repositoryId: 7, repositoryVisibility: 'private',
    repositoryVariables: [], repositoryVariablesAccess: 'available', organizationVariables: variables,
    organizationVariablesAccess: 'available', repositorySecrets: [], repositorySecretsAccess: 'available',
    organizationSecrets: [], organizationSecretsAccess: 'available', organizationAccess: 'available', ...overrides };
}
function run(values: Record<string, string>, options: { configuration?: SetupConfiguration; remote?: Partial<SetupRemoteConfiguration>; explicitQuestionIds?: readonly string[]; observedDevelopmentBranch?: string } = {}) {
  return importSetupOrganizationConfiguration({ configuration: options.configuration ?? createDefaultSetupConfiguration(),
    remote: remote(Object.entries(values).map(([name, value]) => ({ name, value })), options.remote),
    explicitQuestionIds: options.explicitQuestionIds, observedDevelopmentBranch: options.observedDevelopmentBranch });
}

describe('organization configuration import', () => {
  it('imports recognized settings from a complete serialized configuration without mutating either input', () => {
    const source = createDefaultSetupConfiguration();
    source.features.inactiveIssueClosure = true;
    source.repository.desiredAssigneesCount = 3;
    source.repository.repositoryLocale = 'es-ES';
    source.ai.bugbotCommentLimit = 17;
    source.projects.ids = '1,2';
    for (const task of SETUP_AGENT_TASKS) source.agents[task].model = 'gpt-6-luna';
    const configuration = createDefaultSetupConfiguration();
    const snapshot = JSON.stringify(configuration);
    const inventory = remote(buildSetupRepositoryVariables(source));
    const inventorySnapshot = JSON.stringify(inventory);
    const result = importSetupOrganizationConfiguration({ configuration, remote: inventory, observedDevelopmentBranch: 'develop' });
    expect(result.inventory).toBe('available');
    expect(result.configuration.repository).toEqual(source.repository);
    expect(result.configuration.ai).toEqual(source.ai);
    expect(result.configuration.agents).toEqual(source.agents);
    expect(result.configuration.projects).toEqual(source.projects);
    expect(result.settings.filter(setting => setting.reason === 'invalid-value')).toEqual([]);
    expect(result.answeredQuestionIds).toContain('agents.configureIndependently');
    expect(result.answeredQuestionIds).not.toContain('projects.ids');
    expect(JSON.stringify(configuration)).toBe(snapshot);
    expect(JSON.stringify(inventory)).toBe(inventorySnapshot);
    expect(result.configuration.repository).not.toBe(configuration.repository);
  });

  it('keeps false and zero as real values', () => {
    const result = run({ AI_MEMBERS_ONLY: 'false', ORCHESTRATION_DIAGRAMS: 'FALSE', DESIRED_ASSIGNEES_COUNT: '0' });
    expect(result.configuration.ai.membersOnly).toBe(false);
    expect(result.configuration.repository.orchestrationDiagrams).toBe(false);
    expect(result.configuration.repository.desiredAssigneesCount).toBe(0);
    expect(result.answeredQuestionIds).toEqual(expect.arrayContaining(['ai.membersOnly', 'repository.desiredAssigneesCount']));
  });
  it.each([
    ['PROJECT_COLUMN_ISSUE_CREATED', 'issueCreatedColumn'],
    ['PROJECT_COLUMN_PULL_REQUEST_CREATED', 'pullRequestCreatedColumn'],
    ['PROJECT_COLUMN_ISSUE_IN_PROGRESS', 'issueInProgressColumn'],
    ['PROJECT_COLUMN_PULL_REQUEST_IN_PROGRESS', 'pullRequestInProgressColumn'],
  ] as const)('does not prefill a target project column from %s', (variable, field) => {
    const configuration = createDefaultSetupConfiguration(); const before = configuration.projects[field];
    const result = run({ [variable]: 'Foreign project status' }, { configuration });
    expect(result.configuration.projects[field]).toBe(before);
    expect(result.answeredQuestionIds).not.toContain(`projects.${field}`);
    expect(result.settings).toContainEqual(expect.objectContaining({ questionId: `projects.${field}`, status: 'needs-review', reason: 'target-specific' }));
  });
  it('keeps explicitly reviewed target columns when organization and repository inventories disagree', () => {
    const configuration = createDefaultSetupConfiguration(); configuration.projects.issueCreatedColumn = 'Reviewed target status';
    const result = run({ PROJECT_COLUMN_ISSUE_CREATED: 'Foreign status' }, { configuration,
      remote: { repositoryVariables: [{ name: 'PROJECT_COLUMN_ISSUE_CREATED', value: 'Old target status' }] },
      explicitQuestionIds: ['projects.issueCreatedColumn'] });
    expect(result.configuration.projects.issueCreatedColumn).toBe('Reviewed target status');
    expect(result.settings).toContainEqual(expect.objectContaining({ source: 'explicit', status: 'preserved' }));
  });
  it('keeps an empty project-column binding open for target review', () => {
    const result = run({ PROJECT_COLUMN_ISSUE_CREATED: '' });
    expect(result.answeredQuestionIds).not.toContain('projects.issueCreatedColumn');
    expect(result.settings).toContainEqual(expect.objectContaining({ questionId: 'projects.issueCreatedColumn', status: 'needs-review' }));
  });

  it('prefers an exact role binding over the shared fallback', () => {
    const result = run({ AGENT_MODEL: 'gpt-6-luna', REVIEWER_MODEL: 'gpt-6-astra' });
    expect(result.configuration.agents.reviewer.model).toBe('gpt-6-astra');
    expect(result.configuration.agents.findings.model).toBe('gpt-6-luna');
  });

  it('uses shared agent bindings for roles without an exact variable', () => {
    const result = run({ AGENT_MODEL: 'gpt-6-luna', AGENT_PROVIDER: 'codex', AGENT_MODEL_PROVIDER: 'openai' });
    for (const task of SETUP_AGENT_TASKS) expect(result.configuration.agents[task].model).toBe('gpt-6-luna');
  });

  it('preserves same-name repository override precedence and records its provenance', () => {
    const result = run({ BUGBOT_COMMENT_LIMIT: '20' }, { remote: { repositoryVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '7' }] } });
    expect(result.configuration.ai.bugbotCommentLimit).toBe(7);
    expect(result.settings).toContainEqual({ questionId: 'ai.bugbotCommentLimit', variable: 'BUGBOT_COMMENT_LIMIT', source: 'repository', status: 'imported' });
  });

  it.each(['ai.bugbotCommentLimit', 'ai'])('preserves explicit reviewed values at %s', explicit => {
    const configuration = createDefaultSetupConfiguration();
    configuration.ai.bugbotCommentLimit = 9;
    const result = run({ BUGBOT_COMMENT_LIMIT: '20' }, { configuration, explicitQuestionIds: [explicit] });
    expect(result.configuration.ai.bugbotCommentLimit).toBe(9);
    expect(result.settings[0]).toMatchObject({ source: 'explicit', status: 'preserved' });
    expect(result.answeredQuestionIds).not.toContain('ai.bugbotCommentLimit');
  });

  it.each([
    ['AI_MEMBERS_ONLY', 'yes', 'ai.membersOnly'],
    ['DESIRED_ASSIGNEES_COUNT', '1.5', 'repository.desiredAssigneesCount'],
    ['DESIRED_ASSIGNEES_COUNT', '-1', 'repository.desiredAssigneesCount'],
    ['DESIRED_ASSIGNEES_COUNT', '9007199254740992', 'repository.desiredAssigneesCount'],
    ['BUGBOT_COMMENT_LIMIT', '101', 'ai.bugbotCommentLimit'],
    ['RELEASE_RECONCILIATION_STRATEGY', 'invented', 'repository.releaseReconciliationStrategy'],
    ['FINDINGS_MODEL', '', 'agents.findings.model'],
    ['REPOSITORY_LOCALE', 'not_a_locale', 'repository.repositoryLocale'],
    ['FINDINGS_PROVIDER', 'unknown-runtime', 'agents.findings.provider'],
  ])('leaves invalid %s for review instead of silently accepting it', (name, value, questionId) => {
    const configuration = createDefaultSetupConfiguration();
    const result = run({ [name]: value }, { configuration });
    expect(result.configuration).toEqual(configuration);
    expect(result.settings).toContainEqual(expect.objectContaining({ variable: name, questionId, status: 'needs-review', reason: 'invalid-value' }));
    expect(result.answeredQuestionIds).not.toContain(questionId);
  });

  it('imports the enabled issue profile and its release/hotfix dependencies together', () => {
    const result = run({ COPILOT_ISSUE_WORKFLOW_PROFILE: JSON.stringify({ schemaVersion: 1, enabled: ['bugfix', 'help'] }) });
    expect(result.configuration.issueWorkflows.enabled).toEqual(['bugfix', 'help']);
    expect(result.configuration.features.release).toBe(false);
    expect(result.configuration.features.hotfix).toBe(false);
    expect(result.answeredQuestionIds).toContain('issueWorkflows.enabled');
  });

  it.each(['{broken', '{"schemaVersion":2,"enabled":["bugfix"]}', '{"schemaVersion":1,"enabled":["invented"]}'])('rejects an invalid or future issue profile %s', value => {
    const result = run({ COPILOT_ISSUE_WORKFLOW_PROFILE: value });
    expect(result.settings[0]).toMatchObject({ status: 'needs-review', reason: 'invalid-value' });
    expect(result.answeredQuestionIds).not.toContain('issueWorkflows.enabled');
  });

  it('detects duplicate case-insensitive variable identities', () => {
    const result = importSetupOrganizationConfiguration({ configuration: createDefaultSetupConfiguration(),
      remote: remote([{ name: 'BUGBOT_COMMENT_LIMIT', value: '7' }, { name: 'bugbot_comment_limit', value: '9' }]) });
    expect(result.settings[0]).toMatchObject({ status: 'needs-review', reason: 'duplicate-inventory' });
    expect(result.configuration.ai.bugbotCommentLimit).toBe(createDefaultSetupConfiguration().ai.bugbotCommentLimit);
  });

  it.each(['organizationVariablesAccess', 'repositoryVariablesAccess'] as const)('keeps unavailable %s distinct from an empty inventory', field => {
    const result = run({ BUGBOT_COMMENT_LIMIT: '7' }, { remote: { [field]: 'unavailable' } });
    expect(result.inventory).toBe('unavailable');
    expect(result.settings).toEqual([]);
    expect(result.answeredQuestionIds).toEqual([]);
  });

  it('keeps personal repository setup on its existing path', () => {
    expect(run({ BUGBOT_COMMENT_LIMIT: '7' }, { remote: { ownerType: 'User' } }).inventory).toBe('not-organization');
  });

  it('does not mistake an empty successful inventory for an unavailable one', () => {
    const result = run({});
    expect(result.inventory).toBe('available');
    expect(result.answeredQuestionIds).toEqual([]);
  });
});

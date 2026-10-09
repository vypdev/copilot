import { collectApprovalCheck, collectScope, collectSecret, loadSetupOverrides } from '../setup_command_options';
import { mergeSetupOverrides } from '../../application/policies/merge_setup_overrides_policy';
import { ISSUE_WORKFLOW_KINDS } from '../../domain/issue_workflow_profile';
import { createDefaultSetupConfiguration, mergeSetupConfiguration, SETUP_AGENT_TASKS } from '../../application/policies/setup_configuration_defaults';

describe('setup command option adapter', () => {
  test('collects opaque Secrets without logging or altering their values', () => {
    expect(collectSecret('PAT=a=b', { EXISTING: 'keep' })).toEqual({ PAT: 'a=b', EXISTING: 'keep' });
    expect(collectApprovalCheck('CI|42|ci.yml', ['other'])).toEqual(['other', 'CI|42|ci.yml']);
  });

  test.each(['PAT', '=value', 'pat=value', 'PAT='])('rejects malformed Secret flag %s', value => {
    expect(() => collectSecret(value, {})).toThrow('--secret');
  });

  test('collects and normalizes per-resource scopes', () => {
    expect(collectScope('PAT=ORGANIZATION', { EXISTING: 'repository' })).toEqual({ PAT: 'organization', EXISTING: 'repository' });
  });

  test.each(['PAT', '=organization', 'pat=repository', 'PAT=elsewhere'])('rejects malformed scope override %s', value => {
    expect(() => collectScope(value, {})).toThrow('Scope overrides');
  });

  test('maps bounded features and issue workflows', () => {
    const selected = loadSetupOverrides({ features: 'issues,pullRequests', issueWorkflows: 'feature,bugfix' });
    expect(selected.features).toMatchObject({ issues: true, pullRequests: true, release: false });
    expect(selected.issueWorkflows?.enabled).toEqual(['feature', 'bugfix']);
    const all = loadSetupOverrides({ features: 'all', issueWorkflows: 'all' });
    expect(Object.values(all.features ?? {}).every(Boolean)).toBe(true);
    expect(all.issueWorkflows?.enabled).toEqual(ISSUE_WORKFLOW_KINDS);
  });

  test.each([
    [{ features: 'unknown' }, 'Unknown setup feature'],
    [{ issueWorkflows: 'unknown' }, 'Unknown issue workflow'],
    [{ issueWorkflows: 'feature,feature' }, 'cannot contain duplicates'],
    [{ agent: 'unknown' }, '--agent'],
    [{ agentGuidance: 'unknown' }, '--agent-guidance'],
    [{ prApprovalMode: 'unknown' }, '--pr-approval-mode'],
    [{ variablesScope: 'unknown' }, '--variables-scope'],
    [{ secretsScope: 'unknown' }, '--secrets-scope'],
    [{ variablesVisibility: 'unknown' }, '--variables-visibility'],
    [{ secretsVisibility: 'unknown' }, '--secrets-visibility'],
  ] as const)('rejects invalid option %j', (options, message) => {
    expect(() => loadSetupOverrides(options)).toThrow(message);
  });

  test('maps agent, guidance, approval and storage flags into typed overrides', () => {
    const result = loadSetupOverrides({
      agent: 'cursor', agentGuidance: 'disabled', prApprovalMode: 'guarded',
      prApprovalCheck: ['CI|42|ci.yml'], prApprovalCoverageCheck: 'coverage', prApprovalAttestProducer: true,
      variablesScope: 'organization', variablesVisibility: 'private', variableScope: { AGENT_MODEL: 'repository' },
      secretsScope: 'organization', secretsVisibility: 'selected', secretScope: { PAT: 'repository' },
    });
    expect(result.agents?.planner?.provider).toBe('cursor');
    expect(result.repositoryAgentGuidance).toEqual({ agentsPointer: 'disabled', enabled: false });
    expect(result.pullRequestApproval).toMatchObject({
      mode: 'guarded', producerAttested: true, testChecks: [{ name: 'CI', sourceAppId: 42, workflowName: 'ci.yml' }],
      coverage: { mode: 'check', checkName: 'coverage' },
    });
    expect(result.storage).toMatchObject({
      variables: { defaultScope: 'organization', organizationVisibility: 'private', overrides: { AGENT_MODEL: 'repository' } },
      secrets: { defaultScope: 'organization', organizationVisibility: 'selected', overrides: { PAT: 'repository' } },
    });
  });

  test('keeps unspecified approval mode and resource overrides absent', () => {
    const result = loadSetupOverrides({
      prApprovalCheck: ['CI|42|ci.yml'],
      variablesScope: 'repository', secretsScope: 'repository',
    });
    expect(result.pullRequestApproval?.mode).toBeUndefined();
    expect(result.pullRequestApproval?.testChecks).toEqual([{ name: 'CI', sourceAppId: 42, workflowName: 'ci.yml' }]);
    expect(result.storage?.variables?.overrides).toEqual({});
    expect(result.storage?.secrets?.overrides).toEqual({});
  });
});

describe('setup override merge policy', () => {
  test.each(SETUP_AGENT_TASKS)('--agent preserves file model, effort and executable for %s', task => {
    const fileRole = { provider: 'codex' as const, modelProvider: 'openai', model: 'custom-model', effort: 'high', executable: '/usr/local/bin/agent' };
    const fromFile = { agents: { [task]: fileRole } };
    const fromFlags = loadSetupOverrides({ agent: 'cursor' });
    const merged = mergeSetupConfiguration(createDefaultSetupConfiguration(), mergeSetupOverrides(fromFile, fromFlags));
    expect(merged.agents[task]).toEqual({ ...fileRole, provider: 'cursor' });
    expect(SETUP_AGENT_TASKS.every(role => merged.agents[role].provider === 'cursor')).toBe(true);
    expect(fileRole.provider).toBe('codex');
  });

  test('role flags replace explicit fields while preserving other fields and absent roles', () => {
    const file = { agents: { findings: { model: 'file-model', effort: 'high' } } };
    const flags = { agents: { findings: { model: 'flag-model' } } };
    const merged = mergeSetupOverrides(file, flags);
    expect(merged.agents).toEqual({ findings: { model: 'flag-model', effort: 'high' } });
    expect(file.agents.findings.model).toBe('file-model');
    expect(flags.agents.findings).toEqual({ model: 'flag-model' });
    expect(mergeSetupOverrides({}, {}).agents).toEqual({});
  });
  test('CLI storage scope, visibility and per-name flags override conflicting file values', () => {
    const merged = mergeSetupOverrides({ storage: {
      secrets: { defaultScope: 'repository', organizationVisibility: 'private', overrides: { PAT: 'repository' } },
      variables: { defaultScope: 'repository', organizationVisibility: 'private', overrides: { API_KEY: 'repository' } },
    } }, { storage: {
      secrets: { defaultScope: 'organization', organizationVisibility: 'selected', overrides: { PAT: 'organization' } },
      variables: { defaultScope: 'organization', organizationVisibility: 'all', overrides: { API_KEY: 'organization' } },
    } });
    expect(merged.storage?.secrets).toMatchObject({ defaultScope: 'organization', organizationVisibility: 'selected', overrides: { PAT: 'organization' } });
    expect(merged.storage?.variables).toMatchObject({ defaultScope: 'organization', organizationVisibility: 'all', overrides: { API_KEY: 'organization' } });
  });
  test('flag fields win while unrelated file-only fields survive at every nested boundary', () => {
    const merged = mergeSetupOverrides({
      features: { issues: true }, agents: { planner: { provider: 'codex' } },
      repository: { mainBranch: 'master' }, ai: { bugbotSeverity: 'info' },
      pullRequestApproval: { mode: 'recommend', coverage: { mode: 'check', checkName: 'base' } },
      projects: { ids: '1' }, issueWorkflows: { enabled: ['feature'] },
      repositoryAgentGuidance: { enabled: true },
      storage: { secrets: { defaultScope: 'organization', overrides: { PAT: 'repository' } },
        variables: { defaultScope: 'repository', overrides: { OLD: 'organization' } } },
    }, {
      features: { pullRequests: false }, agents: { fixer: { provider: 'cursor' } },
      repository: { developmentBranch: 'develop' }, ai: { bugbotEffort: 'high' },
      pullRequestApproval: { mode: 'guarded', coverage: { mode: 'check', checkName: 'flag' } },
      projects: { issueCreatedColumn: 'Todo' }, issueWorkflows: { enabled: ['bugfix'] },
      repositoryAgentGuidance: { agentsPointer: 'disabled' },
      storage: { secrets: { overrides: { BOT: 'organization' } }, variables: { overrides: { NEW: 'repository' } } },
    });
    expect(merged.features).toMatchObject({ issues: true, pullRequests: false });
    expect(merged.agents).toMatchObject({ planner: { provider: 'codex' }, fixer: { provider: 'cursor' } });
    expect(merged.repository).toMatchObject({ mainBranch: 'master', developmentBranch: 'develop' });
    expect(merged.ai).toMatchObject({ bugbotSeverity: 'info', bugbotEffort: 'high' });
    expect(merged.pullRequestApproval).toMatchObject({ mode: 'guarded', coverage: { mode: 'check', checkName: 'flag' } });
    expect(merged.projects).toMatchObject({ ids: '1', issueCreatedColumn: 'Todo' });
    expect(merged.issueWorkflows?.enabled).toEqual(['bugfix']);
    expect(merged.repositoryAgentGuidance).toMatchObject({ enabled: true, agentsPointer: 'disabled' });
    expect(merged.storage).toMatchObject({
      secrets: { defaultScope: 'organization', overrides: { PAT: 'repository', BOT: 'organization' } },
      variables: { defaultScope: 'repository', overrides: { OLD: 'organization', NEW: 'repository' } },
    });
  });
});

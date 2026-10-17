import type { SetupRemoteConfiguration } from '../../../domain/setup';
import { DEFAULT_PULL_REQUEST_APPROVAL_POLICY } from '../../../domain/pull_request_approval_policy';
import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import { buildSetupRepositoryVariables } from '../setup_configuration_plan';
import { importSetupOrganizationConfiguration } from '../setup_organization_import_policy';

function snapshot(values: Record<string, string>): SetupRemoteConfiguration {
  return { ownerType: 'Organization', defaultBranch: 'master', repositoryId: 7, repositoryVisibility: 'private',
    repositoryVariables: [], repositoryVariablesAccess: 'available',
    organizationVariables: Object.entries(values).map(([name, value]) => ({ name, value })),
    organizationVariablesAccess: 'available', organizationAccess: 'available',
    repositorySecrets: [], repositorySecretsAccess: 'available', organizationSecrets: [], organizationSecretsAccess: 'available' };
}

describe('organization import target and credential boundaries', () => {
  it('does not change the production branch to a different organization default', () => {
    const result = importSetupOrganizationConfiguration({ configuration: createDefaultSetupConfiguration(), remote: snapshot({ MAIN_BRANCH: 'other-main' }) });
    expect(result.configuration.repository.mainBranch).toBe('master');
    expect(result.settings[0]).toMatchObject({ status: 'needs-review', reason: 'target-specific' });
    expect(result.answeredQuestionIds).not.toContain('repository.mainBranch');
  });

  it('retains an unverified development branch as a proposal requiring target review', () => {
    const result = importSetupOrganizationConfiguration({ configuration: createDefaultSetupConfiguration(), remote: snapshot({ DEVELOPMENT_BRANCH: 'integration' }) });
    expect(result.configuration.repository.developmentBranch).toBe('integration');
    expect(result.settings[0]).toMatchObject({ status: 'needs-review', reason: 'target-specific' });
    expect(result.answeredQuestionIds).not.toContain('repository.developmentBranch');
  });

  it('never copies CI commands or queue attestations from another target', () => {
    const result = importSetupOrganizationConfiguration({ configuration: createDefaultSetupConfiguration(), remote: snapshot({
      BUGBOT_AUTOFIX_VERIFY_COMMANDS: 'custom-target-command', MERGE_QUEUE_CHECK_ATTESTATIONS: '[{"target":"another-repository"}]',
    }) });
    expect(result.configuration.ai.bugbotFixVerifyCommands).toBe(createDefaultSetupConfiguration().ai.bugbotFixVerifyCommands);
    expect(result.configuration.repository.mergeQueueCheckAttestations).toEqual([]);
    expect(result.settings).toHaveLength(2);
    expect(result.settings.every(setting => setting.status === 'needs-review')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('custom-target-command');
  });

  it('never reads Secret contents or metadata while importing non-secret settings', () => {
    const remote = snapshot({ BUGBOT_COMMENT_LIMIT: '7' });
    Object.defineProperties(remote, {
      organizationSecrets: { get: () => { throw new Error('Secret read crossed the import boundary.'); } },
      repositorySecrets: { get: () => { throw new Error('Secret read crossed the import boundary.'); } },
    });
    expect(importSetupOrganizationConfiguration({ configuration: createDefaultSetupConfiguration(), remote }).configuration.ai.bugbotCommentLimit).toBe(7);
  });

  it('does not retain a credential-shaped Variable value in configuration or provenance', () => {
    const value = `ghp_${'x'.repeat(36)}`;
    const result = importSetupOrganizationConfiguration({ configuration: createDefaultSetupConfiguration(), remote: snapshot({ FINDINGS_MODEL: value }) });
    expect(result.settings[0]).toMatchObject({ status: 'needs-review', reason: 'invalid-value' });
    expect(JSON.stringify(result)).not.toContain(value);
  });

  it('bounds oversized values before applying or retaining them', () => {
    const value = 'a'.repeat(30_001);
    const result = importSetupOrganizationConfiguration({ configuration: createDefaultSetupConfiguration(), remote: snapshot({ FINDINGS_MODEL: value }) });
    expect(result.settings[0]).toMatchObject({ status: 'needs-review', reason: 'invalid-value' });
    expect(JSON.stringify(result)).not.toContain(value);
  });

  it('ignores unknown and unsafe variable names instead of interpreting them as object paths', () => {
    const result = importSetupOrganizationConfiguration({ configuration: createDefaultSetupConfiguration(), remote: snapshot({
      '__proto__': 'ignored', 'agents.findings.model': 'ignored', 'MAIN_BRANCH\n': 'ignored', UNRELATED_APP_SETTING: 'ignored',
    }) });
    expect(result.settings).toEqual([]);
    expect(result.configuration).toEqual(createDefaultSetupConfiguration());
  });

  it('removes imported approval producer identity and operator attestation', () => {
    const source = createDefaultSetupConfiguration();
    source.ai.bugbotSeverity = 'info';
    source.ai.bugbotTelemetry = true;
    source.pullRequestApproval = { ...DEFAULT_PULL_REQUEST_APPROVAL_POLICY, producerAttested: true,
      testChecks: [{ name: 'Source CI', sourceAppId: 15368, workflowName: 'Source workflow' }],
      coverage: { mode: 'numeric', checkName: 'Source CI', minDiffPercent: 85, artifactWorkflowName: 'Source workflow', reporterAttested: true } };
    const remote = snapshot(Object.fromEntries(buildSetupRepositoryVariables(source).map(variable => [variable.name, variable.value])));
    const result = importSetupOrganizationConfiguration({ configuration: createDefaultSetupConfiguration(), remote });
    expect(result.configuration.pullRequestApproval).toMatchObject({ mode: 'recommend', testChecks: [], producerAttested: false,
      coverage: { mode: 'numeric', checkName: '', artifactWorkflowName: '', reporterAttested: false } });
    expect(result.settings).toContainEqual(expect.objectContaining({ variable: 'PR_APPROVAL_POLICY', status: 'needs-review', reason: 'target-specific' }));
    expect(result.answeredQuestionIds).not.toContain('pullRequestApproval');
  });

  it('preserves an explicit approval child choice instead of replacing its containing policy', () => {
    const configuration = createDefaultSetupConfiguration();
    const result = importSetupOrganizationConfiguration({ configuration,
      remote: snapshot({ PR_APPROVAL_POLICY: JSON.stringify({ ...DEFAULT_PULL_REQUEST_APPROVAL_POLICY, mode: 'off' }) }),
      explicitQuestionIds: ['pullRequestApproval.mode'] });
    expect(result.configuration.pullRequestApproval).toEqual(configuration.pullRequestApproval);
    expect(result.settings[0]).toMatchObject({ source: 'explicit', status: 'preserved' });
  });

  it('preserves explicit capability choices when an inherited profile conflicts', () => {
    const configuration = createDefaultSetupConfiguration();
    const result = importSetupOrganizationConfiguration({ configuration,
      remote: snapshot({ COPILOT_ISSUE_WORKFLOW_PROFILE: '{"schemaVersion":1,"enabled":["bugfix"]}' }),
      explicitQuestionIds: ['features.release'] });
    expect(result.configuration.issueWorkflows).toEqual(configuration.issueWorkflows);
    expect(result.configuration.features.release).toBe(true);
    expect(result.settings[0]).toMatchObject({ status: 'needs-review' });
  });

  it.each(['BUGBOT_AUTOFIX_VERIFY_COMMANDS', 'MERGE_QUEUE_CHECK_ATTESTATIONS', 'MAIN_BRANCH'])('preserves an explicitly reviewed target-specific %s without importing it', variable => {
    const paths: Record<string, string> = { BUGBOT_AUTOFIX_VERIFY_COMMANDS: 'ai.bugbotFixVerifyCommands', MERGE_QUEUE_CHECK_ATTESTATIONS: 'repository.mergeQueueCheckAttestations', MAIN_BRANCH: 'repository.mainBranch' };
    const result = importSetupOrganizationConfiguration({ configuration: createDefaultSetupConfiguration(), remote: snapshot({ [variable]: 'foreign-target' }), explicitQuestionIds: [paths[variable]] });
    expect(result.settings[0].status).toBe('preserved');
  });
  it('keeps a future non-scalar draft setting unimported for explicit repair', () => {
    const configuration = createDefaultSetupConfiguration(); Object.assign(configuration.ai, { bugbotCommentLimit: { futureSchema: true } });
    const result = importSetupOrganizationConfiguration({ configuration, remote: snapshot({ BUGBOT_COMMENT_LIMIT: '9' }) });
    expect(result.settings[0]).toMatchObject({ status: 'needs-review', reason: 'invalid-value' });
  });
  it('rejects malformed approval JSON without exposing provider error details', () => {
    const result = importSetupOrganizationConfiguration({ configuration: createDefaultSetupConfiguration(), remote: snapshot({ PR_APPROVAL_POLICY: '{broken' }) });
    expect(result.settings[0]).toMatchObject({ status: 'needs-review', reason: 'invalid-value' });
    expect(JSON.stringify(result)).not.toContain('{broken');
  });
});

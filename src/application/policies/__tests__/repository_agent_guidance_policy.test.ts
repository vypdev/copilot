import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import { readIssueWorkflowFields } from '../../../domain/issue_workflow_body';
import {
  buildRepositoryAgentProfile,
  parseRepositoryAgentGuidanceManifest,
  validRepositoryAgentProfile,
  REPOSITORY_AGENT_PROFILE_PATH,
  renderRepositoryAgentArtifacts,
  renderRepositoryAgentGuide,
  renderRepositoryAgentPointerBlock,
  renderRepositoryAgentSkill,
  type RepositoryAgentProfile,
} from '../repository_agent_guidance_policy';

describe('repository agent guidance policy', () => {
  it('publisher977-C111: installed required headings obey the configured single-line UTF-8 constraints', () => {
    const profile = buildRepositoryAgentProfile(createDefaultSetupConfiguration());
    const withHeading = (heading: string) => JSON.stringify({ ...profile,
      issueWorkflows: { ...profile.issueWorkflows, forms: { ...profile.issueWorkflows.forms,
        feature: { ...profile.issueWorkflows.forms.feature, requiredFields: [heading, 'Second', 'Third'] } } } });
    for (const heading of ['Description\nExtra', 'Description\rExtra', 'A\u2028B', 'A\u2029B', 'A\0B',
      ' Padded', 'Padded ', 'A'.repeat(129), '😀'.repeat(33)]) {
      expect(validRepositoryAgentProfile(withHeading(heading))).toBe(false);
    }
    for (const heading of ['Custom label', 'A'.repeat(128), '😀'.repeat(32)]) {
      expect(validRepositoryAgentProfile(withHeading(heading))).toBe(true);
    }
    expect(readIssueWorkflowFields('## Description\nExtra\nValue\n', ['Description\nExtra'])[0].count).toBe(0);
  });
  it('publisher977-C108: profile heading uniqueness follows the parser Unicode equivalence', () => {
    const profile = buildRepositoryAgentProfile(createDefaultSetupConfiguration());
    const withFields = (requiredFields: readonly string[]) => JSON.stringify({ ...profile,
      issueWorkflows: { ...profile.issueWorkflows, forms: { ...profile.issueWorkflows.forms,
        feature: { ...profile.issueWorkflows.forms.feature, requiredFields } } } });
    expect(readIssueWorkflowFields('## S\nOne value\n', ['S', '\u017f']).map(field => field.count)).toEqual([1, 1]);
    expect(validRepositoryAgentProfile(withFields(['S', '\u017f', 'Other']))).toBe(false);
    expect(validRepositoryAgentProfile(withFields(['\u212a', 'K', 'Other']))).toBe(false);
    expect(validRepositoryAgentProfile(withFields(['S ', 'S', 'Other']))).toBe(false);
    expect(validRepositoryAgentProfile(withFields(['\u00df', 'SS', 'Other']))).toBe(true);
    expect(readIssueWorkflowFields('## \u00df\nFirst\n## SS\nSecond\n', ['\u00df', 'SS']).map(field => field.value))
      .toEqual(['First', 'Second']);
  });
  it('publisher977-C107: rejects case-insensitive duplicate required headings while preserving distinct custom labels', () => {
    const profile = buildRepositoryAgentProfile(createDefaultSetupConfiguration());
    for (const kind of profile.issueWorkflows.enabled) {
      const fact = profile.issueWorkflows.forms[kind]!;
      const withFields = (requiredFields: readonly string[]) => JSON.stringify({ ...profile,
        issueWorkflows: { ...profile.issueWorkflows,
          forms: { ...profile.issueWorkflows.forms, [kind]: { ...fact, requiredFields } } } });
      const labels = fact.requiredFields.map((_, index) => `Custom heading ${index}`);
      expect(validRepositoryAgentProfile(withFields(labels))).toBe(true);
      if (labels.length > 1) {
        for (const duplicate of [labels[0], labels[0].toUpperCase()]) {
          expect(validRepositoryAgentProfile(withFields([labels[0], duplicate, ...labels.slice(2)]))).toBe(false);
        }
      }
    }
  });
  it('publisher977-C106: rejects missing or excess required field counts while preserving custom labels', () => {
    const profile = buildRepositoryAgentProfile(createDefaultSetupConfiguration());
    for (const kind of profile.issueWorkflows.enabled) {
      const fact = profile.issueWorkflows.forms[kind]!;
      const withFields = (requiredFields: readonly string[]) => JSON.stringify({ ...profile,
        issueWorkflows: { ...profile.issueWorkflows,
          forms: { ...profile.issueWorkflows.forms, [kind]: { ...fact, requiredFields } } } });
      for (const fields of [[], fact.requiredFields.slice(1), [...fact.requiredFields, 'Extra heading']]) {
        expect(validRepositoryAgentProfile(withFields(fields))).toBe(false);
      }
      expect(validRepositoryAgentProfile(withFields(fact.requiredFields.map((_, index) => `Custom heading ${index}`)))).toBe(true);
    }
  });
  it.each(['feature', 'bugfix', 'help', 'chore', 'documentation', 'hotfix', 'release'] as const)(
    'publisher977-C104: rejects a noncanonical %s template even when it is nonempty', kind => {
      const profile = buildRepositoryAgentProfile(createDefaultSetupConfiguration());
      const input = structuredClone(profile);
      (input.issueWorkflows.forms[kind] as { template: string }).template = 'foreign-form.yml';
      expect(validRepositoryAgentProfile(JSON.stringify(input))).toBe(false);
    },
  );
  it.each([
    ['missing inventory', undefined], ['null inventory', null], ['array inventory', []], ['text inventory', 'unknown'],
    ['unmanaged path', { '../outside.json': { role: 'profile', sha256: 'a'.repeat(64) } }],
    ['null record', { [REPOSITORY_AGENT_PROFILE_PATH]: null }],
    ['array record', { [REPOSITORY_AGENT_PROFILE_PATH]: [] }],
    ['text record', { [REPOSITORY_AGENT_PROFILE_PATH]: 'untrusted' }],
    ['unknown record field', { [REPOSITORY_AGENT_PROFILE_PATH]: { role: 'profile', sha256: 'a'.repeat(64), approved: true } }],
    ['unknown role', { [REPOSITORY_AGENT_PROFILE_PATH]: { role: 'foreign', sha256: 'a'.repeat(64) } }],
    ['invalid digest', { [REPOSITORY_AGENT_PROFILE_PATH]: { role: 'profile', sha256: 'short' } }],
    ['wrong path role', { [REPOSITORY_AGENT_PROFILE_PATH]: { role: 'guide', sha256: 'a'.repeat(64) } }],
  ])('rejects malformed or out-of-scope guidance metadata: %s', (_name, artifacts) => {
    const input = { schemaVersion: 2, generator: { name: '@vypdev/copilot', contractVersion: 1 },
      profileDigest: 'a'.repeat(64), artifacts };
    expect(parseRepositoryAgentGuidanceManifest(JSON.stringify(input))).toBeUndefined();
  });

  it.each([
    ['null installation', null], ['unknown owner', { lifecycleOwner: 'github-action' }],
    ['foreign branch namespace', { branchNamespace: 'arbitrary/branch' }], ['issue authority', { requiresIssue: true }],
    ['automatic merge', { automaticMerge: true }], ['unknown field', { approved: true }],
  ])('does not certify unsupported installed profile authority: %s', (_name, change) => {
    const original = buildRepositoryAgentProfile(createDefaultSetupConfiguration());
    const installation = change === null ? null : { ...original.installation, ...change };
    expect(validRepositoryAgentProfile(JSON.stringify({ ...original, installation }))).toBe(false);
  });

  it('rejects pre-branch SDD authority when the otherwise consistent profile disables managed branches', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.repository.issueManagedBranches = false; configuration.repository.preBranchSdd = true;
    const profile = buildRepositoryAgentProfile(configuration);
    expect(Object.values(profile.issueWorkflows.forms).every(fact => !fact.createsManagedBranch)).toBe(true);
    expect(validRepositoryAgentProfile(JSON.stringify(profile))).toBe(false);
  });

  it('rejects unknown workflow-profile approval metadata instead of silently importing it', () => {
    const profile = buildRepositoryAgentProfile(createDefaultSetupConfiguration());
    const input = { ...profile, issueWorkflows: { ...profile.issueWorkflows, approved: true } };
    expect(validRepositoryAgentProfile(JSON.stringify(input))).toBe(false);
  });

  it('explains operator-owned runtime preparation without silently installing Java', () => {
    const guide = renderRepositoryAgentGuide(buildRepositoryAgentProfile(createDefaultSetupConfiguration()));
    expect(guide).toContain('every job');
    expect(guide).toContain('.copilot/verification-prerequisites.json');
    expect(guide).toContain('no language is inferred');
    expect(guide).toContain('JAVA_HOME');
    expect(guide).toContain('#repository-verification-prerequisites');
    expect(guide).not.toContain('run:');
  });
  it('projects every default workflow and Action-owned collaboration boundary', () => {
    const configuration = createDefaultSetupConfiguration();
    const profile = buildRepositoryAgentProfile(configuration);

    expect(profile.issueWorkflows.enabled).toEqual([
      'feature', 'bugfix', 'documentation', 'chore', 'help', 'hotfix', 'release',
    ]);
    expect(profile.issueWorkflows.forms.feature).toMatchObject({
      template: 'feature_request.yml',
      createsManagedBranch: true,
      branchPrefix: configuration.repository.featureTree,
    });
    expect(profile.issueWorkflows.forms.help).toMatchObject({
      template: 'help_request.yml',
      createsManagedBranch: false,
      branchPrefix: null,
    });
    expect(profile.issueWorkflows.forms.hotfix?.workflow).toBe('hotfix_workflow.yml');
    expect(profile.issueWorkflows.forms.release?.workflow).toBe('release_workflow.yml');
    expect(profile.branches).toMatchObject({ issueManagedBranches: true, preBranchSdd: false, startLabel: 'in-progress', readyLabel: 'branched' });
    expect(profile.deployment.launcherLabel).toBe('deploy');

    const guide = renderRepositoryAgentGuide(profile);
    expect(guide).toContain('exact installed Issue Form');
    expect(guide).toContain('Action-managed');
    expect(guide).toContain('| `help` |');
    expect(guide).toContain('starts every admitted issue by adding `in-progress`');
  });

  it('projects disabled forms, custom workflows, labels, and SDD branch gating', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.features.issueTemplates = false;
    configuration.issueWorkflows = { enabled: ['feature', 'hotfix', 'release'] };
    configuration.repository.issueManagedBranches = true;
    configuration.repository.preBranchSdd = true;
    configuration.actionInputs['hotfix-workflow'] = 'custom-hotfix.yml';
    configuration.actionInputs['release-workflow'] = 'custom-release.yml';
    configuration.actionInputs['deploy-label'] = 'ship';
    const profile = buildRepositoryAgentProfile(configuration);

    expect(profile.issueWorkflows.formsEnabled).toBe(false);
    expect(profile.issueWorkflows.forms.feature?.template).toBeNull();
    expect(profile.issueWorkflows.forms.hotfix?.workflow).toBe('custom-hotfix.yml');
    expect(profile.issueWorkflows.forms.release?.workflow).toBe('custom-release.yml');
    expect(profile.branches.preBranchSdd).toBe(true);
    expect(profile.deployment.launcherLabel).toBe('ship');
    expect(validRepositoryAgentProfile(JSON.stringify(profile))).toBe(true);

    const guide = renderRepositoryAgentGuide(profile);
    expect(guide).toContain('Issue Forms are disabled');
    expect(guide).toContain('maintainer-approved manual issue');
    expect(guide).toContain('answer the Action\'s blocking questions');
  });

  it('disables forms when issue automation is disabled even if templates remain selected', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.features.issues = false;
    configuration.features.issueTemplates = true;

    expect(buildRepositoryAgentProfile(configuration).issueWorkflows.formsEnabled).toBe(false);
  });

  it('renders a stable empty-profile guide and the complete artifact set', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.issueWorkflows = { enabled: [] };
    const profile = buildRepositoryAgentProfile(configuration);
    const guide = renderRepositoryAgentGuide(profile);
    const artifacts = renderRepositoryAgentArtifacts(configuration);

    expect(guide).toContain('| none | No managed issue workflow is enabled');
    expect(artifacts.map(artifact => artifact.role)).toEqual(['profile', 'guide', 'skill']);
    expect(JSON.parse(artifacts[0].content).issueWorkflows.enabled).toEqual([]);
    expect(renderRepositoryAgentSkill()).toContain('normal contributor credentials');
    expect(renderRepositoryAgentPointerBlock()).toContain('Managed remote branches are owned by the GitHub Action.');
  });

  it('renders the defensive no-required-fields row without weakening branch ownership', () => {
    const base = buildRepositoryAgentProfile(createDefaultSetupConfiguration());
    const feature = base.issueWorkflows.forms.feature!;
    const profile: RepositoryAgentProfile = {
      ...base,
      issueWorkflows: {
        ...base.issueWorkflows,
        enabled: ['feature'],
        forms: { feature: { ...feature, requiredFields: [] } },
      },
    };

    const guide = renderRepositoryAgentGuide(profile);

    expect(guide).toContain('| `feature` |');
    expect(guide).toContain('| none | Action-managed');
  });
});

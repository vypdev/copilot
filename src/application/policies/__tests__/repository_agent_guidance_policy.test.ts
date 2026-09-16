import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import {
  buildRepositoryAgentProfile,
  renderRepositoryAgentArtifacts,
  renderRepositoryAgentGuide,
  renderRepositoryAgentPointerBlock,
  renderRepositoryAgentSkill,
  type RepositoryAgentProfile,
} from '../repository_agent_guidance_policy';

describe('repository agent guidance policy', () => {
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
    expect(profile.branches.launcher).toEqual({ mode: 'label', label: 'branched' });
    expect(profile.deployment.launcherLabel).toBe('deploy');

    const guide = renderRepositoryAgentGuide(profile);
    expect(guide).toContain('exact installed Issue Form');
    expect(guide).toContain('Action-managed');
    expect(guide).toContain('| `help` |');
    expect(guide).toContain('Implementation is launched by the `branched` label');
  });

  it('projects disabled forms, custom workflows, labels, and always-on branch management', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.features.issueTemplates = false;
    configuration.issueWorkflows = { enabled: ['feature', 'hotfix', 'release'] };
    configuration.repository.branchManagementAlways = true;
    configuration.actionInputs['hotfix-workflow'] = 'custom-hotfix.yml';
    configuration.actionInputs['release-workflow'] = 'custom-release.yml';
    configuration.actionInputs['deploy-label'] = 'ship';
    const profile = buildRepositoryAgentProfile(configuration);

    expect(profile.issueWorkflows.formsEnabled).toBe(false);
    expect(profile.issueWorkflows.forms.feature?.template).toBeNull();
    expect(profile.issueWorkflows.forms.hotfix?.workflow).toBe('custom-hotfix.yml');
    expect(profile.issueWorkflows.forms.release?.workflow).toBe('custom-release.yml');
    expect(profile.branches.launcher.mode).toBe('always');
    expect(profile.deployment.launcherLabel).toBe('ship');

    const guide = renderRepositoryAgentGuide(profile);
    expect(guide).toContain('Issue Forms are disabled');
    expect(guide).toContain('maintainer-approved manual issue');
    expect(guide).toContain('Branch management starts automatically');
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

import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import { selectedInitialIssueTypes, selectedInitialLabels } from '../setup_issue_resource_policy';
import {
  effectiveIssueFormLabels,
  effectiveIssueWorkflowFeatures,
  effectiveIssueWorkflowLabels,
  effectiveIssueWorkflowProfile,
} from '../setup_issue_workflow_policy';

const labels = {
  branchManagementLauncherLabel: 'branched',
  bug: 'bug', bugfix: 'bugfix', hotfix: 'hotfix', enhancement: 'enhancement', feature: 'feature', release: 'release',
  question: 'question', help: 'help', deploy: 'deploy', deployed: 'deployed', docs: 'docs', documentation: 'documentation',
  chore: 'chore', maintenance: 'maintenance', priorityHigh: 'high', priorityMedium: 'medium', priorityLow: 'low', priorityNone: 'none',
  sizeXxl: 'xxl', sizeXl: 'xl', sizeL: 'l', sizeM: 'm', sizeS: 's', sizeXs: 'xs',
  lifecycle: { aiProcessing: 'state:ai' },
} as never;

const issueTypes = Object.fromEntries([
  'task', 'bug', 'feature', 'documentation', 'maintenance', 'hotfix', 'release', 'question', 'help',
].flatMap(key => [[key, key], [`${key}Description`, `${key} description`], [`${key}Color`, 'BLUE']])) as never;

describe('selected setup issue resources', () => {
  it('returns the original resources when no setup configuration is available', () => {
    expect(selectedInitialLabels(labels, undefined)).toBe(labels);
    expect(selectedInitialIssueTypes(issueTypes, undefined)).toBe(issueTypes);
  });

  it('provisions only labels required by enabled issue workflow kinds', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.issueWorkflows = { enabled: ['bugfix', 'help'] };
    const selected = selectedInitialLabels(labels, configuration);

    expect(selected).toMatchObject({ bug: 'bug', bugfix: 'bugfix', help: 'help', question: 'question' });
    expect(selected.feature).toBe('');
    expect(selected.release).toBe('');
    expect(selected.deploy).toBe('');
    expect(selected.branchManagementLauncherLabel).toBe('branched');
    expect(selected.priorityHigh).toBe('high');
  });

  it('keeps help branchless when it is the only enabled kind', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.issueWorkflows = { enabled: ['help'] };
    expect(selectedInitialLabels(labels, configuration).branchManagementLauncherLabel).toBe('');
  });

  it('provisions only native Issue Types selected by the profile', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.issueWorkflows = { enabled: ['chore', 'release'] };
    const selected = selectedInitialIssueTypes(issueTypes, configuration);

    expect(selected.maintenance).toBe('maintenance');
    expect(selected.release).toBe('release');
    expect(selected.feature).toBe('');
    expect(selected.task).toBe('');
    expect(selected.question).toBe('');
  });

  it('keeps all configured workflow resources when every kind is enabled', () => {
    const configuration = createDefaultSetupConfiguration();

    expect(selectedInitialLabels(labels, configuration)).toMatchObject({
      feature: 'feature', help: 'help', hotfix: 'hotfix', release: 'release', deploy: 'deploy',
    });
    expect(selectedInitialIssueTypes(issueTypes, configuration)).toMatchObject({
      feature: 'feature', maintenance: 'maintenance', help: 'help', hotfix: 'hotfix', release: 'release',
    });
  });

  it('clears every workflow-specific resource for an empty profile', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.issueWorkflows = { enabled: [] };

    expect(selectedInitialLabels(labels, configuration)).toMatchObject({
      feature: '', bug: '', docs: '', chore: '', help: '', hotfix: '', release: '',
      branchManagementLauncherLabel: '', deploy: '', deployed: '',
    });
    expect(selectedInitialIssueTypes(issueTypes, configuration)).toMatchObject({
      feature: '', bug: '', documentation: '', maintenance: '', help: '', hotfix: '', release: '',
    });
  });
});

describe('effective issue workflow setup policy', () => {
  it('uses all workflows for legacy setup configuration and disables all when issues are off', () => {
    const configuration = createDefaultSetupConfiguration();
    expect(effectiveIssueWorkflowProfile({
      features: configuration.features,
      issueWorkflows: undefined,
    } as never).enabled).toHaveLength(7);

    configuration.features.issues = false;
    expect(effectiveIssueWorkflowProfile(configuration).enabled).toEqual([]);
  });

  it('combines explicit workflow selection with release and hotfix feature switches', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.issueWorkflows = { enabled: ['feature', 'hotfix', 'release'] };
    configuration.features.hotfix = false;
    configuration.features.release = false;

    expect(effectiveIssueWorkflowProfile(configuration).enabled).toEqual(['feature']);
    expect(effectiveIssueWorkflowFeatures(configuration)).toMatchObject({ hotfix: false, release: false });
  });

  it('projects custom and fallback routing, priority, and launcher labels', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.actionInputs['feature-label'] = 'kind:feature';
    configuration.actionInputs['enhancement-label'] = '  ';
    configuration.actionInputs['priority-low-label'] = 'p3';
    configuration.actionInputs['branch-management-launcher-label'] = 'start';

    const labelsByKind = effectiveIssueWorkflowLabels(configuration);
    const formLabels = effectiveIssueFormLabels(configuration);

    expect(labelsByKind.feature).toEqual(['enhancement', 'kind:feature']);
    expect(formLabels.feature).toEqual(['enhancement', 'kind:feature', 'p3']);
    expect(formLabels.hotfix).toContain('start');
  });
});

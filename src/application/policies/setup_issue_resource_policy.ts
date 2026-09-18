import type {
  InitialIssueTypeConfiguration,
  InitialLabelConfiguration,
} from '../ports/issue_management_ports';
import type { SetupConfiguration } from '../../domain/setup';
import { effectiveIssueWorkflowProfile } from './setup_issue_workflow_policy';

/** Removes workflow-specific resources that are not part of the effective profile. */
export function selectedInitialLabels(
  labels: InitialLabelConfiguration,
  configuration: Readonly<SetupConfiguration> | undefined,
): InitialLabelConfiguration {
  if (!configuration) return labels;
  const enabled = new Set(effectiveIssueWorkflowProfile(configuration).enabled);
  const selected = { ...labels, lifecycle: { ...labels.lifecycle } } as Record<string, unknown>;
  const clear = (...keys: string[]) => keys.forEach(key => { selected[key] = ''; });
  if (!enabled.has('feature')) clear('feature', 'enhancement');
  if (!enabled.has('bugfix')) clear('bug', 'bugfix');
  if (!enabled.has('documentation')) clear('docs', 'documentation');
  if (!enabled.has('chore')) clear('chore', 'maintenance');
  if (!enabled.has('help')) clear('help', 'question');
  if (!enabled.has('hotfix')) clear('hotfix');
  if (!enabled.has('release')) clear('release');
  if (!enabled.has('hotfix') && !enabled.has('release')) clear('deploy', 'deployed');
  return Object.freeze(selected) as unknown as InitialLabelConfiguration;
}

/** Projects only native Issue Types used by enabled workflow kinds. */
export function selectedInitialIssueTypes(
  issueTypes: InitialIssueTypeConfiguration,
  configuration: Readonly<SetupConfiguration> | undefined,
): InitialIssueTypeConfiguration {
  if (!configuration) return issueTypes;
  const enabled = new Set(effectiveIssueWorkflowProfile(configuration).enabled);
  const selected = { ...issueTypes } as Record<string, unknown>;
  const clearType = (key: string) => {
    selected[key] = '';
    selected[`${key}Description`] = '';
    selected[`${key}Color`] = '';
  };
  clearType('task');
  clearType('question');
  if (!enabled.has('feature')) clearType('feature');
  if (!enabled.has('bugfix')) clearType('bug');
  if (!enabled.has('documentation')) clearType('documentation');
  if (!enabled.has('chore')) clearType('maintenance');
  if (!enabled.has('help')) clearType('help');
  if (!enabled.has('hotfix')) clearType('hotfix');
  if (!enabled.has('release')) clearType('release');
  return Object.freeze(selected) as unknown as InitialIssueTypeConfiguration;
}

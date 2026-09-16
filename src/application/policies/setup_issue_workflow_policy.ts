import type { SetupConfiguration } from '../../domain/setup';
import {
  createIssueWorkflowProfile,
  ISSUE_WORKFLOW_KINDS,
  type IssueWorkflowProfile,
} from '../../domain/issue_workflow_profile';

/** Applies feature switches to the explicit issue workflow selection. */
export function effectiveIssueWorkflowProfile(configuration: Pick<SetupConfiguration, 'features' | 'issueWorkflows'>): IssueWorkflowProfile {
  const configured = configuration.issueWorkflows?.enabled ?? ISSUE_WORKFLOW_KINDS;
  const enabled = configuration.features.issues === false
    ? []
    : configured.filter(kind => kind !== 'release' || configuration.features.release !== false)
      .filter(kind => kind !== 'hotfix' || configuration.features.hotfix !== false);
  return createIssueWorkflowProfile(enabled);
}

/** The workflow profile is authoritative for release/hotfix setup assets. */
export function effectiveIssueWorkflowFeatures(
  configuration: Pick<SetupConfiguration, 'features' | 'issueWorkflows'>,
): SetupConfiguration['features'] {
  const profile = effectiveIssueWorkflowProfile(configuration);
  return {
    ...configuration.features,
    release: configuration.features.release !== false && profile.enabled.includes('release'),
    hotfix: configuration.features.hotfix !== false && profile.enabled.includes('hotfix'),
  };
}

export function effectiveIssueWorkflowLabels(
  configuration: Pick<SetupConfiguration, 'actionInputs'>,
): Readonly<Record<import('../../domain/issue_workflow_profile').IssueWorkflowKind, readonly string[]>> {
  const configured = (key: string, fallback: string) => configuration.actionInputs[key]?.trim() || fallback;
  return Object.freeze({
    feature: Object.freeze([configured('enhancement-label', 'enhancement'), configured('feature-label', 'feature')]),
    bugfix: Object.freeze([configured('bug-label', 'bug'), configured('bugfix-label', 'bugfix')]),
    documentation: Object.freeze([configured('documentation-label', 'documentation'), configured('docs-label', 'docs')]),
    chore: Object.freeze([configured('chore-label', 'chore'), configured('maintenance-label', 'maintenance')]),
    help: Object.freeze([configured('help-label', 'help'), configured('question-label', 'question')]),
    hotfix: Object.freeze([configured('hotfix-label', 'hotfix')]),
    release: Object.freeze([configured('release-label', 'release')]),
  });
}

export function effectiveIssueFormLabels(
  configuration: Pick<SetupConfiguration, 'actionInputs'>,
): Readonly<Record<import('../../domain/issue_workflow_profile').IssueWorkflowKind, readonly string[]>> {
  const labels = effectiveIssueWorkflowLabels(configuration);
  const configured = (key: string, fallback: string) => configuration.actionInputs[key]?.trim() || fallback;
  const priority = {
    high: configured('priority-high-label', 'priority: high'),
    medium: configured('priority-medium-label', 'priority: medium'),
    low: configured('priority-low-label', 'priority: low'),
  };
  const launcher = configured('branch-management-launcher-label', 'branched');
  return Object.freeze({
    feature: Object.freeze([...labels.feature, priority.low]),
    bugfix: Object.freeze([...labels.bugfix, priority.high]),
    documentation: Object.freeze([...labels.documentation, priority.low]),
    chore: Object.freeze([...labels.chore, priority.low]),
    help: Object.freeze([...labels.help, priority.medium]),
    hotfix: Object.freeze([...labels.hotfix, launcher, priority.high]),
    release: Object.freeze([...labels.release, launcher, priority.medium]),
  });
}

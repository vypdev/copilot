import type { SetupPlanPresenterPort } from '../application/ports/setup_terminal_ports';
import { SETUP_AGENT_TASKS, SETUP_FEATURE_DESCRIPTIONS } from '../application/policies/setup_configuration_policy';
import type { SetupPlan } from '../domain/setup';
import { color, doctorIcon, formatTask, renderBox } from './setup_prompt_rendering';

export class ConsoleSetupPlanPresenter implements SetupPlanPresenterPort {
  present(plan: SetupPlan): void {
    console.log(renderSetupPlan(plan));
  }
}

export function renderSetupPlan(plan: SetupPlan): string {
  const enabledFeatures = Object.entries(plan.configuration.features)
    .filter(([, enabled]) => enabled)
    .map(([feature]) => `  ${color('✓', 32)} ${SETUP_FEATURE_DESCRIPTIONS[feature] ?? feature}`)
    .join('\n');
  const agents = SETUP_AGENT_TASKS
    .map((task) => `  ${formatTask(task)}: ${plan.configuration.agents[task].provider} / ${plan.configuration.agents[task].modelProvider}/${plan.configuration.agents[task].model}`)
    .join('\n');
  const content = [
    color('Capabilities', 36), enabledFeatures || '  (none)', '',
    color('Agent routing', 36), agents, '',
    color('Repository changes', 36),
    `  Files selected: ${plan.selectedFiles.length}`,
    `  Variables to upsert: ${plan.configuration.manageRepositoryVariables ? plan.variables.length : 0}`,
    `  Secret options to validate/provision: ${plan.configuration.manageRepositorySecrets ? plan.credentialRequirements.length : 0}`,
    `  Variable storage: ${storageLabel(plan.configuration.storage.variables)}`,
    `  Secret storage: ${storageLabel(plan.configuration.storage.secrets)}`,
    '  Labels and issue types: always checked by Copilot setup',
    `  Initial tag: ${plan.configuration.createInitialTag ? 'v1.0.0 when no version tag exists' : 'disabled'}`, '',
    ...(plan.mergeQueueReadiness.length > 0 ? [
      color('Merge queue readiness', 36),
      ...plan.mergeQueueReadiness.map((check) => `  ${doctorIcon(check.status)} ${check.id}: ${check.summary}`),
      '',
    ] : []),
    color('Strictly required Secrets', 33), `  ${plan.requiredSecrets.join(', ') || '(none)'}`,
    ...(plan.warnings.length > 0 ? ['', color('Important notes', 33), ...plan.warnings.map((warning) => `  ⚠ ${warning}`)] : []),
  ].join('\n');
  return renderBox(content, 'Setup Plan', 32);
}

function storageLabel(policy: SetupPlan['configuration']['storage']['variables']): string {
  return `${policy.defaultScope} scope${policy.defaultScope === 'organization' ? ` (${policy.organizationVisibility})` : ''}`;
}

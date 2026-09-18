import type { SetupPlanPresenterPort } from '../application/ports/setup_terminal_ports';
import { SETUP_AGENT_TASKS, SETUP_FEATURE_DESCRIPTIONS } from '../application/policies/setup_configuration_policy';
import type { SetupPlan } from '../domain/setup';
import { color, doctorIcon, formatTask, renderBox } from './setup_prompt_rendering';
import { FIXED_APPROVAL_EXCLUSIONS } from '../domain/pull_request_approval_policy';

export class ConsoleSetupPlanPresenter implements SetupPlanPresenterPort {
  present(plan: SetupPlan): void {
    console.log(renderSetupPlan(plan));
  }
}

export function renderSetupPlan(plan: SetupPlan): string {
  const approval = plan.configuration.pullRequestApproval;
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
    color('Pull-request approval', 36),
    `  Mode: ${approval.mode} (new setup; absent runtime policy stays off)`,
    `  Scope: ${approval.targetRoles.join(', ')} / ${approval.branchKinds.join(', ')}; linked issue ${approval.requireLinkedIssue ? 'required' : 'optional'}`,
    `  Protected paths: ${FIXED_APPROVAL_EXCLUSIONS.length} fixed trust-boundary patterns; ${approval.additionalExcludedPaths.length} extra`,
    `  Test producers: ${approval.testChecks.map(check => `${check.name} [App ${check.sourceAppId}, ${check.workflowName}]`).join('; ') || '(not selected)'}`,
    `  Producer/coverage enforcement: ${approval.producerAttested ? 'operator-attested' : 'not attested'}`,
    `  Coverage: ${approval.coverage.mode} / ${approval.coverage.checkName || '(not selected)'}`,
    ...(approval.coverage.mode === 'numeric' ? [`  Numeric reporter: ${approval.coverage.artifactWorkflowName || '(not selected)'}; threshold ${approval.coverage.minDiffPercent}%; ${approval.coverage.reporterAttested ? 'installed (operator-attested)' : 'not attested'}`] : []),
    `  Bugbot: ${plan.configuration.ai.bugbotSeverity} floor, telemetry ${plan.configuration.ai.bugbotTelemetry ? 'on' : 'off'}, dry-run ${plan.configuration.ai.bugbotDryRun ? 'on' : 'off'}`,
    `  Observer: ${approval.mode === 'off' ? 'not installed' : 'copilot_pull_request_approval.yml (active only after default-branch installation)'}`,
    '  Runtime PAT: Secret PAT; bot identity and Pull requests write need verification.',
    `  Outcome: ${approval.mode === 'off' ? 'disabled' : approval.mode === 'recommend' ? 'recommendation only' : 'eligible PRs may be approved after default-branch installation and live evidence'}`,
    '  Native approval still requires readable stale-dismissal rules and a distinct runtime PAT bot.', '',
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
    ...(plan.approvalReadiness.length > 0 ? [
      color('Approval readiness', 36),
      ...plan.approvalReadiness.map((check) => `  ${doctorIcon(check.status)} ${check.id}: ${check.summary}`),
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

<script lang="ts">
  import type { WebSetupPlan } from '../../../src/application/contracts/web_setup_view';
  import { tr, type SetupMessageKey } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import { featureName } from '../i18n/featureNames';
  import { agentRoleName } from '../i18n/agentRoleNames';
  import { questionOptionLabel } from '../i18n/questionOptions';
  export let decisions: WebSetupPlan['decisions'];
  const transitionKey: Record<string, SetupMessageKey> = {
    issueCreated: 'projectTransitionIssueCreated', pullRequestCreated: 'projectTransitionPullRequestCreated',
    issueInProgress: 'projectTransitionIssueInProgress', pullRequestInProgress: 'projectTransitionPullRequestInProgress',
  };
  function scopeLabel(value: string): string {
    return tr(value === 'repository' ? 'scopeRepository' : value === 'organization' ? 'scopeOrganization' : 'scopeDisabled', $setupLocale);
  }
  function approvalLabel(value: string): string {
    return tr(value === 'guarded' ? 'approvalGuarded' : value === 'recommend' ? 'approvalRecommend' : 'approvalOff', $setupLocale);
  }
</script>

<section class="plan-decisions" aria-labelledby="plan-decisions-title"><h3 id="plan-decisions-title">{tr('planChoices', $setupLocale)}</h3>
  <dl>
    <div><dt>{tr('planEnabledCapabilities', $setupLocale)}</dt><dd>{decisions.enabledCapabilities.length ? decisions.enabledCapabilities.map(item => featureName(item, $setupLocale)).join(', ') : tr('none', $setupLocale)}</dd></div>
    <div><dt>{tr('planIssueWorkflows', $setupLocale)}</dt><dd>{decisions.issueWorkflows.length ? decisions.issueWorkflows.map(item => questionOptionLabel('issueWorkflows.enabled', item, $setupLocale)).join(', ') : tr('none', $setupLocale)}</dd></div>
    <div><dt>{tr('planAgentRouting', $setupLocale)}</dt><dd><ul>{#each decisions.agentRouting as agent}<li>{agentRoleName(agent.role, $setupLocale)}: <bdi>{agent.provider} · {agent.modelProvider}/{agent.model}</bdi></li>{/each}</ul></dd></div>
    <div><dt>{tr('planBranchRoles', $setupLocale)}</dt><dd><bdi>{decisions.productionBranch}</bdi> / <bdi>{decisions.developmentBranch}</bdi></dd></div>
    <div><dt>{tr('planApprovalMode', $setupLocale)}</dt><dd>{approvalLabel(decisions.approvalMode)}</dd></div>
    {#if decisions.approvalMode !== 'off'}
      <div><dt>{tr('planTrustedChecks', $setupLocale)}</dt><dd>{#if decisions.trustedChecks.length}<ul>{#each decisions.trustedChecks as check}<li><bdi>{check.name}</bdi> · {tr('producerAppId', $setupLocale)} {check.sourceAppId} · <bdi>{check.workflowName}</bdi></li>{/each}</ul>{:else}{tr('none', $setupLocale)}{/if}</dd></div>
      <div><dt>{tr('planProducerAttested', $setupLocale)}</dt><dd>{tr(decisions.producerAttested ? 'yes' : 'no', $setupLocale)}</dd></div>
      <div><dt>{tr('planCoverage', $setupLocale)}</dt><dd>{questionOptionLabel('pullRequestApproval.coverage.mode', decisions.coverageMode, $setupLocale)}{#if decisions.coverageCheck} · <bdi>{decisions.coverageCheck}</bdi>{/if}</dd></div>
      {#if decisions.coverageMode === 'numeric'}
        <div><dt>{tr('planCoverageThreshold', $setupLocale)}</dt><dd>{decisions.coverageMinimum === undefined ? tr('none', $setupLocale) : `${decisions.coverageMinimum}%`}</dd></div>
        <div><dt>{tr('planCoverageReporter', $setupLocale)}</dt><dd><bdi>{decisions.coverageArtifactWorkflow || tr('none', $setupLocale)}</bdi></dd></div>
        <div><dt>{tr('planReporterAttested', $setupLocale)}</dt><dd>{tr(decisions.coverageReporterAttested ? 'yes' : 'no', $setupLocale)}</dd></div>
      {/if}
    {/if}
    <div><dt>{tr('editProjects', $setupLocale)}</dt><dd>{decisions.projectNumbers.length ? decisions.projectNumbers.map(item => `#${item}`).join(', ') : tr('none', $setupLocale)}</dd></div>
    {#if decisions.projectNumbers.length}<div><dt>{tr('planProjectStatuses', $setupLocale)}</dt><dd><ul>{#each decisions.projectStatuses as status}<li>{tr(transitionKey[status.transition], $setupLocale)}: <bdi>{status.value}</bdi></li>{/each}</ul></dd></div>{/if}
    <div><dt>{tr('planVariableScope', $setupLocale)}</dt><dd>{scopeLabel(decisions.variableScope)}</dd></div>
    <div><dt>{tr('planSecretScope', $setupLocale)}</dt><dd>{scopeLabel(decisions.secretScope)}</dd></div>
    <div><dt>{tr('planIssueResources', $setupLocale)}</dt><dd>{tr('planIssueResourcesValue', $setupLocale)}</dd></div>
    <div><dt>{tr('planInitialTag', $setupLocale)}</dt><dd>{tr(decisions.initialTag ? 'yes' : 'no', $setupLocale)}</dd></div>
  </dl>
  <p class="field-help">{tr('planAdvancedDefaults', $setupLocale)}</p>
</section>

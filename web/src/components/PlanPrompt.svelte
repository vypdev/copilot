<script lang="ts">
  import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';
  import ActionButton from './ActionButton.svelte';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import { localizedPlanWarning } from '../i18n/planWarningCopy';
  import type { SetupQuestion } from '../../../src/application/contracts/web_setup_view';
  import PlanDecisionSummary from './PlanDecisionSummary.svelte';
  import WorkflowPatStorageNotice from './WorkflowPatStorageNotice.svelte';
  import { permissionName, permissionTerm } from '../i18n/permissionTerms';
  export let prompt: Extract<WebSetupPrompt, { kind: 'plan' }>;
  export let controller: boolean;
  export let busy: boolean;
  export let onSubmit: (value: string) => Promise<void>;
  $: sections = [
    { title: tr('files', $setupLocale), items: prompt.plan.files },
    { title: tr('workflows', $setupLocale), items: prompt.plan.workflows },
    { title: tr('variables', $setupLocale), items: prompt.plan.variables },
    { title: tr('secretNames', $setupLocale), items: prompt.plan.secrets },
  ];
  const groupKeys: Record<SetupQuestion['stateId'], import('../i18n/catalog').SetupMessageKey> = {
    capabilities: 'editCapabilities', 'agent-runtime': 'editRuntimes', 'agent-model-defaults': 'editModels',
    'agent-role-overrides': 'editRoleModels', repository: 'editRepository', deployment: 'editDeployment',
    bugbot: 'editBugbot', 'pull-request-approval': 'editApproval', projects: 'editProjects',
    provisioning: 'editProvisioning', storage: 'editStorage',
  };
</script>

<div class="plan-review">
<p class="description">{tr('planBody', $setupLocale)}</p>
<section class="plan-decisions" aria-label={tr('planPermissionProbeTitle', $setupLocale)}>
  <h3>{tr('planPermissionProbeTitle', $setupLocale)}</h3>
  <p>{tr('planPermissionProbeBody', $setupLocale)}</p>
  {#if prompt.plan.permissionProbes?.some(probe => probe.permission === 'Actions')}
    <p>{tr('planActionsProbePrerequisites', $setupLocale)}</p>
  {/if}
  {#if prompt.plan.permissionProbes?.some(probe => probe.permission === 'Secrets')}
    <p>{tr('planSecretProbeLimit', $setupLocale)}</p>
  {/if}
  <ul>{#each prompt.plan.permissionProbes as probe}<li>{permissionTerm($setupLocale, probe.scope)}: {permissionName($setupLocale, probe.permission)}</li>{:else}<li>{tr('none', $setupLocale)}</li>{/each}</ul>
</section>
<PlanDecisionSummary decisions={prompt.plan.decisions} />
{#if prompt.plan.workflowPatStorage}<WorkflowPatStorageNotice storage={prompt.plan.workflowPatStorage} />{/if}
{#if prompt.plan.presentationDefaults.length}
  <section class="plan-decisions"><h3>{tr('planBasicDefaultsIntro', $setupLocale)}</h3>
    <ul>{#each prompt.plan.presentationDefaults as group}<li>{groupKeys[group.group as SetupQuestion['stateId']] ? tr(groupKeys[group.group as SetupQuestion['stateId']], $setupLocale) : group.group}: {group.count}</li>{/each}</ul>
  </section>
{/if}
<div class="plan-sections">{#each sections as section}<details class="plan-inventory"><summary><span>{section.title}</span><span>{section.items.length}</span></summary><ul>{#each section.items as item}<li><bdi>{item}</bdi></li>{:else}<li>{tr('none', $setupLocale)}</li>{/each}</ul></details>{/each}</div>
{#if prompt.plan.warnings.length}<div class="plan-warnings"><h3>{tr('beforeContinue', $setupLocale)}</h3><ul>{#each prompt.plan.warnings as warning}<li>{localizedPlanWarning(warning, $setupLocale)}</li>{/each}</ul></div>{/if}
{#if prompt.editGroups?.length}
  <section class="plan-edit"><h3>{tr('changeAnswersTitle', $setupLocale)}</h3><p class="field-help">{tr('changeAnswersHelp', $setupLocale)}</p>
    <div class="plan-edit-actions">{#each prompt.editGroups as group}<button type="button" class="secondary-button" onclick={() => onSubmit(`revise:${group}`)} disabled={!controller || busy}>{tr('changeSection', $setupLocale, { section: tr(groupKeys[group], $setupLocale) })}</button>{/each}</div>
  </section>
{/if}
<div class="button-row"><ActionButton label={tr('stopHere', $setupLocale)} variant="secondary" onClick={() => onSubmit('decline')} disabled={!controller || busy} /><ActionButton label={tr('approvePlan', $setupLocale)} arrow onClick={() => onSubmit('approve')} disabled={!controller || busy} /></div>
</div>

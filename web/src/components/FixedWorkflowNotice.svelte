<script lang="ts">
  import type { SetupQuestion } from '../../../src/application/contracts/web_setup_view';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  export let question: SetupQuestion;
</script>

{#if question.id === 'features.issues' && (question.fixedWorkflowFeatures?.release || question.fixedWorkflowFeatures?.hotfix)}
  <p class="field-help">{tr('fixedIssuesRequired', $setupLocale)}</p>
{:else if question.fixedWorkflowFeatures}
  {#each Object.entries(question.fixedWorkflowFeatures).filter(([, fixed]) => fixed !== undefined) as [kind, fixed]}
    <p class="field-help">{tr(fixed ? 'fixedWorkflowEnabled' : 'fixedWorkflowDisabled', $setupLocale, { kind })}</p>
  {/each}
{/if}

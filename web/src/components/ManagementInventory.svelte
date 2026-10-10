<script lang="ts">
  import type { SetupManagementView } from '../../../src/application/contracts/web_setup_view';
  import { managementCopy } from '../i18n/managementCopy';
  import { setupLocale } from '../i18n/localeStore';
  export let view: SetupManagementView;
  $: copy = managementCopy($setupLocale);
</script>
<section class="management-section">
  <h2>{copy.credentials}</h2><p class="description">{copy.secretHelp}</p>
  {#if view.secretInventory !== 'available'}<p>{copy.unknown}</p>{/if}
  <ul>{#each view.secrets as secret}<li><strong>{secret.name}</strong> · {copy[secret.scope]} {#if secret.shadowed}· {copy.shadowed}{/if}</li>{/each}</ul>
</section>
<details class="management-section">
  <summary>{copy.variables} ({view.variables.length})</summary>
  {#if !view.variables.length}<p>{copy.empty}</p>{/if}
  <dl class="management-values">{#each view.variables as variable}<dt>{variable.name} · {copy[variable.scope]} {#if variable.shadowed}· {copy.shadowed}{/if}</dt><dd>{variable.value}</dd>{/each}</dl>
</details>
<details class="management-section">
  <summary>{copy.details} ({view.workflows.length})</summary>
  {#each view.workflows as workflow}
    <details class="management-workflow"><summary>{workflow.file}</summary>
      <p>{workflow.action}</p>
      <dl class="management-values">{#each workflow.inputs as input}<dt>{input.name}</dt><dd>{input.unsupported ? copy.unknown : input.variable ? `vars.${input.variable}` : input.literal}{#if input.fallback !== undefined} · {copy.workflow}: {input.fallback}{/if}</dd>{/each}</dl>
    </details>
  {/each}
</details>

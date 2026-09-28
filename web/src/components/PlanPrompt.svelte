<script lang="ts">
  import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';
  import ActionButton from './ActionButton.svelte';
  export let prompt: Extract<WebSetupPrompt, { kind: 'plan' }>;
  export let controller: boolean;
  export let busy: boolean;
  export let onSubmit: (value: string) => Promise<void>;
  $: sections = [
    { title: 'Files', items: prompt.plan.files },
    { title: 'Workflows', items: prompt.plan.workflows },
    { title: 'Variables', items: prompt.plan.variables },
    { title: 'Secret names', items: prompt.plan.secrets },
  ];
</script>

<p class="description">Review exactly what this run may change. The bot PAT and any additional credentials are collected next.</p>
<div class="plan-sections">{#each sections as section}<div><h3>{section.title} <span>{section.items.length}</span></h3><ul>{#each section.items as item}<li>{item}</li>{/each}</ul></div>{/each}</div>
{#if prompt.plan.warnings.length}<div class="plan-warnings"><h3>Before you continue</h3><ul>{#each prompt.plan.warnings as warning}<li>{warning}</li>{/each}</ul></div>{/if}
<div class="button-row"><ActionButton label="Stop here" variant="secondary" onClick={() => onSubmit('decline')} disabled={!controller || busy} /><ActionButton label="Approve this plan" arrow onClick={() => onSubmit('approve')} disabled={!controller || busy} /></div>

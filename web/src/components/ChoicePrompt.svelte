<script lang="ts">
  import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';
  export let prompt: Extract<WebSetupPrompt, { kind: 'choice' | 'confirm' }>;
  export let controller: boolean;
  export let busy: boolean;
  export let onSubmit: (value: string) => Promise<void>;
</script>

<div class="choice-list">{#each prompt.choices as option}<button class="choice-card" onclick={() => onSubmit(option)} disabled={!controller || busy}><span>{option}</span><span aria-hidden="true">↗</span></button>{/each}</div>

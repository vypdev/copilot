<script lang="ts">
  import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';
  import QuestionPrompt from './QuestionPrompt.svelte';
  import ChoicePrompt from './ChoicePrompt.svelte';
  import CredentialPrompt from './CredentialPrompt.svelte';
  import PlanPrompt from './PlanPrompt.svelte';
  export let prompt: WebSetupPrompt;
  export let revision: number;
  export let controller: boolean;
  export let busy: boolean;
  export let onSubmit: (value: string) => Promise<void>;
</script>

<section class="card decision-card" aria-label="Current setup decision">
  <div class="card-header"><span class="card-kicker">CURRENT DECISION</span><span class="revision">SESSION {revision}</span></div>
  {#if 'description' in prompt && prompt.description}<p class="description">{prompt.description}</p>{/if}
  {#if prompt.kind === 'question'}
    <QuestionPrompt {prompt} {controller} {busy} {onSubmit} />
  {:else if prompt.kind === 'choice' || prompt.kind === 'confirm'}
    <ChoicePrompt {prompt} {controller} {busy} {onSubmit} />
  {:else if prompt.kind === 'text' || prompt.kind === 'secret'}
    <CredentialPrompt {prompt} {controller} {busy} {onSubmit} />
  {:else if prompt.kind === 'plan'}
    <PlanPrompt {prompt} {controller} {busy} {onSubmit} />
  {/if}
</section>

<script lang="ts">
  import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';
  import QuestionPrompt from './QuestionPrompt.svelte';
  import ChoicePrompt from './ChoicePrompt.svelte';
  import CredentialPrompt from './CredentialPrompt.svelte';
  import PlanPrompt from './PlanPrompt.svelte';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import { localizedPromptCopy } from '../i18n/promptCopy';
  import { focusOnRevision } from '../lib/focusOnRevision';
  export let prompt: WebSetupPrompt;
  export let revision: number;
  export let promptRevision: number;
  export let controller: boolean;
  export let busy: boolean;
  export let onSubmit: (value: string) => Promise<void>;
  export let onRetryDiscovery: () => Promise<void>;
  export let onBack: () => Promise<void>;
  $: copy = localizedPromptCopy(prompt, $setupLocale);
</script>

<section class="card decision-card" aria-label={tr('currentDecision', $setupLocale)} tabindex="-1" use:focusOnRevision={promptRevision}>
  <div class="card-header"><span class="card-kicker">{tr('currentDecision', $setupLocale)}</span><span class="revision">{tr('session', $setupLocale)} {revision}</span></div>
  {#if prompt.kind !== 'question'}<h2>{copy?.title ?? prompt.title}</h2>{/if}
  {#if copy?.description || ('description' in prompt && prompt.description)}<p class="description">{copy?.description ?? ('description' in prompt ? prompt.description : '')}</p>{/if}
  {#key promptRevision}
    {#if prompt.kind === 'question'}
      <QuestionPrompt {prompt} {controller} {busy} {onSubmit} {onRetryDiscovery} {onBack} />
    {:else if prompt.kind === 'choice' || prompt.kind === 'confirm'}
      <ChoicePrompt {prompt} {controller} {busy} {onSubmit} />
    {:else if prompt.kind === 'text' || prompt.kind === 'secret'}
      <CredentialPrompt {prompt} {controller} {busy} {onSubmit} />
    {:else if prompt.kind === 'plan'}
      <PlanPrompt {prompt} {controller} {busy} {onSubmit} />
    {/if}
  {/key}
</section>

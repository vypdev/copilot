<script lang="ts">
  import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';
  import { safeGithubLink } from '../lib/githubLink';
  import ActionButton from './ActionButton.svelte';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  export let prompt: Extract<WebSetupPrompt, { kind: 'text' | 'secret' }>;
  export let controller: boolean;
  export let busy: boolean;
  export let onSubmit: (value: string) => Promise<void>;
  let value = '';
  $: githubLink = safeGithubLink(prompt.link);

  function submit(): void {
    const submitted = value;
    if (prompt.kind === 'secret') value = '';
    void onSubmit(submitted);
  }
</script>

{#if githubLink}<a class="github-link" href={githubLink} target="_blank" rel="noopener noreferrer">{tr('githubForm', $setupLocale)} <span aria-hidden="true">↗</span></a><p class="field-help">{tr('githubFormHelp', $setupLocale)}</p>{/if}
<label for="answer">{tr(prompt.kind === 'secret' ? 'pasteHere' : 'yourAnswer', $setupLocale)}</label>
<input id="answer" type={prompt.kind === 'secret' ? 'password' : 'text'} bind:value disabled={!controller} autocomplete="off" spellcheck="false" autocapitalize="off" placeholder={tr(prompt.kind === 'secret' ? 'hiddenAfter' : 'typeAnswer', $setupLocale)} />
{#if prompt.kind === 'secret'}<p class="field-help">{tr('secretHelp', $setupLocale)}</p>{/if}
<ActionButton label={tr('continue', $setupLocale)} arrow onClick={submit} disabled={!controller || busy || (!prompt.optional && !value.trim())} />

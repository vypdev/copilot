<script lang="ts">
  import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';
  import { safeGithubLink } from '../lib/githubLink';
  import ActionButton from './ActionButton.svelte';
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

{#if githubLink}<a class="github-link" href={githubLink} target="_blank" rel="noopener noreferrer">Open the official GitHub PAT form <span aria-hidden="true">↗</span></a><p class="field-help">Check the signed-in account, select <strong>Only select repositories</strong>, then select this repository. GitHub handles 2FA and creates the PAT.</p>{/if}
<label for="answer">{prompt.kind === 'secret' ? 'Paste the value here' : 'Your answer'}</label>
<input id="answer" type={prompt.kind === 'secret' ? 'password' : 'text'} bind:value disabled={!controller} autocomplete="off" spellcheck="false" autocapitalize="off" placeholder={prompt.kind === 'secret' ? 'Hidden after submission' : 'Type your answer'} />
{#if prompt.kind === 'secret'}<p class="field-help">Sent only to this local process. It will not be shown again or saved in browser storage.</p>{/if}
<ActionButton label="Continue" arrow onClick={submit} disabled={!controller || busy || (!prompt.optional && !value.trim())} />

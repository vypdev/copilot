<script lang="ts">
  import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';
  import { localizedPromptChoice } from '../i18n/promptCopy';
  import { setupLocale } from '../i18n/localeStore';
  import { tr } from '../i18n/catalog';
  import { repositorySecretSettingsLink } from '../lib/githubLink';
  export let prompt: Extract<WebSetupPrompt, { kind: 'choice' | 'confirm' }>;
  export let controller: boolean;
  export let busy: boolean;
  export let onSubmit: (value: string) => Promise<void>;
  $: conflictLink = prompt.copyId === 'botPat.scopeConflict' || prompt.copyId === 'botPat.scopeConflictUnavailable'
    ? repositorySecretSettingsLink(prompt.copyValues?.repository) : undefined;
</script>

{#if conflictLink}<a class="github-link" href={conflictLink} target="_blank" rel="noopener noreferrer">{tr('repositorySecretSettings', $setupLocale)} <span aria-hidden="true">↗</span></a>{/if}
<div class="choice-list">{#each prompt.choices as option, index}<button class="choice-card" onclick={() => onSubmit(option)} disabled={!controller || busy}><span>{localizedPromptChoice(prompt, $setupLocale, index)}</span><span aria-hidden="true">↗</span></button>{/each}</div>

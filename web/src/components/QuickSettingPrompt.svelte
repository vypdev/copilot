<script lang="ts">
  import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';
  import { managementCopy, settingName, settingValue } from '../i18n/managementCopy';
  import { setupLocale } from '../i18n/localeStore';
  import QuestionGuidance from './QuestionGuidance.svelte';
  import { safeHelpLink } from '../lib/helpLink';
  export let prompt: Extract<WebSetupPrompt, { kind: 'quick-edit' | 'quick-review' }>;
  export let controller: boolean;
  export let busy: boolean;
  export let onSubmit: (value: string) => Promise<void>;
  let value = prompt.kind === 'quick-edit' ? prompt.current : '';
  $: copy = managementCopy($setupLocale);
</script>
{#if prompt.kind === 'quick-edit'}
  <h2>{settingName(prompt.id, $setupLocale)}</h2>
  {#if prompt.presentation}
    <p class="description">{prompt.presentation[$setupLocale].summary}</p>
    <QuestionGuidance explanation={prompt.presentation[$setupLocale]} helpUrl={safeHelpLink(prompt.presentation[$setupLocale].documentation.url)} />
  {/if}
  <p class="description">{copy.current}: {settingValue(prompt.current, $setupLocale)}</p>
  <form onsubmit={(event) => { event.preventDefault(); void onSubmit(String(value ?? '')); }}>
    <label for="setting-value">{copy.next}</label>
    {#if prompt.choices}<select id="setting-value" bind:value disabled={!controller || busy}>{#each prompt.choices as option}<option value={option}>{settingValue(option, $setupLocale)}</option>{/each}</select>
    {:else}<input id="setting-value" type="number" bind:value min={prompt.min} max={prompt.max} step="1" required disabled={!controller || busy} />{/if}
    <div class="button-row"><button class="button secondary" type="button" onclick={() => onSubmit('cancel')} disabled={!controller || busy}>{copy.back}</button><button class="button primary" type="submit" disabled={!controller || busy}>{copy.preview}</button></div>
  </form>
{:else}
  <h2>{copy.review}</h2><h3>{settingName(prompt.change.id, $setupLocale)}</h3>
  <dl class="management-values"><dt>{copy.current}</dt><dd>{settingValue(prompt.change.before, $setupLocale)}</dd><dt>{copy.next}</dt><dd>{settingValue(prompt.change.after, $setupLocale)}</dd><dt>{copy.source}</dt><dd>{copy[prompt.change.scope]}</dd></dl>
  <div class="banner" class:warning={prompt.change.scope === 'organization'} role="note">{prompt.change.scope === 'organization' ? copy.orgImpact : copy.repoImpact}</div>
  <p class="description">{copy.effect}</p>
  <div class="button-row"><button class="button secondary" onclick={() => onSubmit('cancel')} disabled={!controller || busy}>{copy.back}</button><button class="button primary" onclick={() => onSubmit('approve')} disabled={!controller || busy}>{copy.apply}</button></div>
{/if}

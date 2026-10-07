<script lang="ts">
  import type { SetupManagementView } from '../../../src/application/contracts/web_setup_view';
  import { managementCopy, settingName, settingValue } from '../i18n/managementCopy';
  import { setupLocale } from '../i18n/localeStore';
  import ManagementInventory from './ManagementInventory.svelte';
  export let view: SetupManagementView;
  export let controller: boolean;
  export let busy: boolean;
  export let onSubmit: (value: string) => Promise<void>;
  $: copy = managementCopy($setupLocale);
</script>
<h1>{copy.title}</h1>
<p class="management-status" role="status">{copy[view.status]}</p>
<p class="lede">{copy.intro}</p>
{#if view.github === 'not-connected'}<p class="description">{copy.local}</p>{/if}
{#if view.github === 'incomplete'}<div class="banner warning" role="note">{copy.githubIncomplete}</div>{/if}
<div class="management-actions">
  {#if view.status !== 'unconfigured'}<button class="button primary" onclick={() => onSubmit(view.github === 'not-connected' ? 'connect' : 'refresh')} disabled={!controller || busy}>{view.github === 'not-connected' ? copy.connect : copy.refresh}</button>{/if}
  <button class="button" class:primary={view.status === 'unconfigured'} class:secondary={view.status !== 'unconfigured'} onclick={() => onSubmit('wizard')} disabled={!controller || busy}>{view.status === 'unconfigured' ? copy.start : copy.wizard}</button>
</div>
{#if view.status !== 'unconfigured'}
  <section class="management-section" aria-labelledby="quick-title">
    <h2 id="quick-title">{copy.quick}</h2><p class="description">{copy.quickHelp}</p>
    <div class="management-settings">
      {#each view.settings as setting}
        <div class="management-setting">
          <div><h3>{settingName(setting.id, $setupLocale)}</h3><p>{setting.value === undefined ? copy.unknown : settingValue(setting.value, $setupLocale)}{#if setting.source !== 'unknown'}{' · '}{copy[setting.source]}{/if}</p></div>
          <button class="button secondary" aria-label={`${copy.edit}: ${settingName(setting.id, $setupLocale)}`} disabled={!controller || busy || !setting.editable} onclick={() => onSubmit(`edit:${setting.id}`)}>{copy.edit}</button>
        </div>
      {/each}
    </div>
  </section>
  <ManagementInventory {view} />
{/if}
<p class="field-help">{copy.limits}</p>
<div class="button-row"><button class="button secondary" onclick={() => onSubmit('close')} disabled={!controller || busy}>{copy.finish}</button></div>

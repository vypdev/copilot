<script lang="ts">
  import ActionButton from './ActionButton.svelte';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  export let busy: boolean;
  export let onPair: (code: string) => Promise<void>;
  export let mode: 'pair' | 'takeover' = 'pair';
  let code = '';

  function submit(): void {
    const entered = code;
    code = '';
    void onPair(entered);
  }
</script>

<section class="card decision-card" aria-label={tr(mode === 'pair' ? 'pairTitle' : 'takeOver', $setupLocale)}>
  <div class="card-header"><span class="card-kicker">{tr('privateSession', $setupLocale)}</span></div>
  <div class="question-heading"><h2>{tr(mode === 'pair' ? 'pairTitle' : 'takeOver', $setupLocale)}</h2></div>
  <p class="description">{tr(mode === 'pair' ? 'pairBody' : 'readOnlyBody', $setupLocale)}</p>
  <form onsubmit={(event) => { event.preventDefault(); submit(); }}>
    <label for="pairing-code">{tr('pairLabel', $setupLocale)}</label>
    <input id="pairing-code" type="text" bind:value={code} maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" disabled={busy} placeholder={tr('pairPlaceholder', $setupLocale)} />
    <p class="field-help">{tr('pairHelp', $setupLocale)}</p>
    <ActionButton label={tr(mode === 'pair' ? 'pairButton' : 'takeOver', $setupLocale)} arrow onClick={submit} disabled={busy || code.trim().length !== 16} />
  </form>
</section>

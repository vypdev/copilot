<script lang="ts">
  import { tick } from 'svelte';
  import ActionButton from './ActionButton.svelte';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import { canSubmitPairingCode } from '../lib/pairingCode';
  export let busy: boolean;
  export let onPair: (code: string) => Promise<void>;
  export let mode: 'pair' | 'takeover' = 'pair';
  let code = '';
  let input: HTMLInputElement;

  async function submit(): Promise<void> {
    if (!canSubmitPairingCode(code, busy)) return;
    const entered = code.trim();
    code = '';
    await onPair(entered);
    await tick();
    // A successful pairing removes this control; a rejected code needs correction here.
    if (input?.isConnected && !input.disabled) input.focus();
  }
</script>

<section class="card decision-card" aria-label={tr(mode === 'pair' ? 'pairTitle' : 'takeOver', $setupLocale)}>
  <div class="card-header"><span class="card-kicker">{tr('privateSession', $setupLocale)}</span></div>
  <div class="question-heading"><h2>{tr(mode === 'pair' ? 'pairTitle' : 'takeOver', $setupLocale)}</h2></div>
  <p class="description">{tr(mode === 'pair' ? 'pairBody' : 'readOnlyBody', $setupLocale)}</p>
  <form onsubmit={(event) => { event.preventDefault(); submit(); }}>
    <label for="pairing-code">{tr('pairLabel', $setupLocale)}</label>
    <input id="pairing-code" type="text" bind:this={input} bind:value={code} aria-describedby="pairing-help" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" disabled={busy} placeholder={tr('pairPlaceholder', $setupLocale)} />
    <p id="pairing-help" class="field-help">{tr('pairHelp', $setupLocale)}</p>
    <div class="button-row"><ActionButton label={tr(mode === 'pair' ? 'pairButton' : 'takeOver', $setupLocale)} arrow onClick={submit} disabled={!canSubmitPairingCode(code, busy)} /></div>
  </form>
</section>

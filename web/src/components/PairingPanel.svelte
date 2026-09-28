<script lang="ts">
  import ActionButton from './ActionButton.svelte';
  export let busy: boolean;
  export let onPair: (code: string) => Promise<void>;
  let code = '';

  function submit(): void {
    const entered = code;
    code = '';
    void onPair(entered);
  }
</script>

<section class="card decision-card" aria-label="Pair this browser with the local setup session">
  <div class="card-header"><span class="card-kicker">PRIVATE LOCAL SESSION</span></div>
  <div class="question-heading"><h2>Pair this browser</h2></div>
  <p class="description">Find the 16-character pairing code in the terminal that started <code>copilot setup --web</code>. Enter it here to view or control this setup. The code is never placed in the browser URL or stored after this page closes.</p>
  <form onsubmit={(event) => { event.preventDefault(); submit(); }}>
    <label for="pairing-code">Pairing code from terminal</label>
    <input id="pairing-code" type="text" bind:value={code} maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" disabled={busy} placeholder="16 hexadecimal characters" />
    <p class="field-help">Keep the code private. After refreshing this page, enter it again to reconnect.</p>
    <ActionButton label="Connect to local setup" arrow onClick={submit} disabled={busy || code.trim().length !== 16} />
  </form>
</section>

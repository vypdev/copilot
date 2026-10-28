<script lang="ts">
    import { onDestroy, untrack } from 'svelte';
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    let { context, actions }: CenterRouteProps = $props();
    const revision = untrack(() => context.settings.revision);
    let hasFile = $state(false); let fileError = $state(false); let exportError = $state(false); let readingFile = $state(false);
    let scope = $state('appearance');
    const m = $derived(context.copy.messages);
    $effect(() => actions.dirty(hasFile)); onDestroy(() => actions.dirty(false));
    async function importFile(): Promise<void> {
        if (readingFile) return;
        readingFile = true; fileError = !await actions.importSettings(revision); hasFile = false; readingFile = false;
    }
    async function exportFile(): Promise<void> { exportError = !await actions.exportSettings(); }
</script>
<p>{m.dataPrivacy}</p>
<button type="button" onclick={exportFile}>{m.export}</button>
{#if exportError}<p role="alert">{m.downloadFailed}</p>{/if}
<form aria-busy={readingFile} onsubmit={event => { event.preventDefault(); void importFile(); }}>
    <fieldset disabled={!context.editable || readingFile}>
        <legend>{m.import}</legend><label for="center-import">{m.importLabel}</label>
        <input id="center-import" type="file" accept="application/json,.json" aria-describedby="import-hint" required onchange={event => { hasFile = event.currentTarget.files?.length === 1; fileError = false; }}>
        <p id="import-hint">{m.importHint}</p><button type="submit" disabled={!hasFile}>{m.import}</button>
        {#if fileError}<p role="alert">{m.invalidFile}</p>{/if}
    </fieldset>
</form>
<form onsubmit={event => { event.preventDefault(); actions.preview({ type: 'reset', scope }, context.settings.revision); }}>
    <fieldset disabled={!context.editable || hasFile}>
        <legend>{m.reset}</legend><label for="center-reset">{m.scope}</label><select id="center-reset" bind:value={scope}>
            <option value="appearance">{m.resetAppearance}</option><option value="global">{m.resetGlobal}</option>
            <option value="profiles">{m.resetProfiles}</option><option value="all">{m.resetAll}</option>
        </select><button type="submit">{m.preview}</button>
    </fieldset>
</form>
<button type="button" disabled={!context.editable || hasFile || !context.rollbackAvailable} onclick={() => actions.preview({ type: 'rollback' }, context.settings.revision)}>{m.rollback}</button>
{#if !context.rollbackAvailable}<p>{m.noRollback}</p>{/if}

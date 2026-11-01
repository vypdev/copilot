<script lang="ts">
    import { workspaceCopy } from '../domain/workspace_copy.ts';
    import { onDestroy } from 'svelte';
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { navigationCopy } from '../domain/navigation_copy.ts';
    import { centerLocationHash } from '../domain/center_routes.ts';
    let { context, actions }: CenterRouteProps = $props();
    let hasFile = $state(false); let fileError = $state(false); let exportError = $state(false); let readingFile = $state(false);
    let scope = $state('appearance');
    const m = $derived(context.copy.messages);
    const navigation = $derived(navigationCopy(context.copy.locale));
    const privacyTools = ['privacy', 'connections', 'overview'] as const;
    $effect(() => actions.dirty(hasFile)); onDestroy(() => actions.dirty(false));
    async function importFile(): Promise<void> {
        if (readingFile) return;
        readingFile = true; fileError = !await actions.importSettings(context.settings.revision); hasFile = false; readingFile = false;
    }
    async function exportFile(): Promise<void> { exportError = !await actions.exportSettings(); }
</script>
<p>{m.dataPrivacy}</p><p>{workspaceCopy(context.copy.locale).export}</p><p>{workspaceCopy(context.copy.locale).restore}</p>
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
<section aria-labelledby="data-privacy-tools-heading"><h2 id="data-privacy-tools-heading">{navigation.privacyTools}</h2>
    <p>{navigation.privacyScope}</p><ul>{#each privacyTools as route}<li><a href={centerLocationHash({ route })}>{context.copy.routes[route]}</a></li>{/each}</ul>
</section>

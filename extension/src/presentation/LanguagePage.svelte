<script lang="ts">
    import { onDestroy, untrack } from 'svelte';
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    let { context, actions }: CenterRouteProps = $props();
    const baseline = untrack(() => context.settings);
    let locale = $state(baseline.locale);
    const dirty = $derived(locale !== baseline.locale);
    $effect(() => actions.dirty(dirty)); onDestroy(() => actions.dirty(false));
</script>
<form onsubmit={event => { event.preventDefault(); actions.preview({ type: 'preferences', values: { locale } }, baseline.revision); }}>
    {#if context.settings.revision !== baseline.revision}<p role="status">{context.copy.messages.draftChanged}</p>{/if}
    <fieldset disabled={!context.editable}>
        <legend>{context.copy.routes.language}</legend><label for="center-locale">{context.copy.messages.language}</label>
        <select id="center-locale" bind:value={locale}>
            <option value="auto">{context.copy.messages.auto}</option><option value="en">English</option>
            <option value="es">Español</option><option value="fr">Français</option><option value="pt">Português</option>
        </select><button type="submit" disabled={!dirty}>{context.copy.messages.preview}</button>
    </fieldset>
</form>

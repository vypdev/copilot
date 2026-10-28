<script lang="ts">
    import { onDestroy, untrack } from 'svelte';
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    let { context, actions }: CenterRouteProps = $props();
    const baseline = untrack(() => context.settings);
    let theme = $state(baseline.theme); let density = $state(baseline.density);
    let text = $state(baseline.center.appearance.text); let motion = $state(baseline.center.appearance.motion);
    let contrast = $state(baseline.center.appearance.contrast);
    const m = $derived(context.copy.messages);
    const dirty = $derived(theme !== baseline.theme || density !== baseline.density || text !== baseline.center.appearance.text
        || motion !== baseline.center.appearance.motion || contrast !== baseline.center.appearance.contrast);
    $effect(() => actions.dirty(dirty)); onDestroy(() => actions.dirty(false));
    function preview(): void {
        actions.preview({ type: 'appearance', values: { theme, density, text, motion, contrast } }, baseline.revision);
    }
</script>
<form onsubmit={event => { event.preventDefault(); preview(); }}>
    {#if context.settings.revision !== baseline.revision}<p role="status">{m.draftChanged}</p>{/if}
    <fieldset disabled={!context.editable}>
        <legend>{context.copy.routes.appearance}</legend>
        <label for="center-theme">{m.theme}</label><select id="center-theme" bind:value={theme}>
            <option value="github">{m.github}</option><option value="light">{m.light}</option><option value="dark">{m.dark}</option>
        </select>
        <label for="center-density">{m.density}</label><select id="center-density" bind:value={density}>
            <option value="comfortable">{m.comfortable}</option><option value="compact">{m.compact}</option>
        </select>
        <label for="center-text">{m.text}</label><select id="center-text" bind:value={text}>
            <option value="standard">{m.standard}</option><option value="large">{m.large}</option>
        </select>
        <label for="center-motion">{m.motion}</label><select id="center-motion" bind:value={motion}>
            <option value="system">{m.system}</option><option value="reduced">{m.reduced}</option>
        </select>
        <label for="center-contrast">{m.contrast}</label><select id="center-contrast" bind:value={contrast}>
            <option value="system">{m.system}</option><option value="high">{m.high}</option>
        </select>
        <button type="submit" disabled={!dirty}>{m.preview}</button>
    </fieldset>
</form>

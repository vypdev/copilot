<script lang="ts">
    import { onDestroy, untrack } from 'svelte';
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import type { Settings } from '../domain/settings.ts';
    import { CENTER_COMMANDS, centerCommandRoute, validCenterBindings, type CenterCommand } from '../domain/shortcuts.ts';
    import { shortcutsCopy } from '../domain/shortcuts_copy.ts';
    let { context, actions }: CenterRouteProps = $props();
    function assignments(settings: Settings): Record<CenterCommand, string> {
        return Object.fromEntries(CENTER_COMMANDS.map(command => [command, settings.center.bindings.find(binding => binding.command === command)?.binding ?? ''])) as Record<CenterCommand, string>;
    }
    let baseline = $state.raw(untrack(() => context.settings));
    let enabled = $state(untrack(() => baseline.shortcuts)); let values = $state(untrack(() => assignments(baseline)));
    const copy = $derived(shortcutsCopy(context.copy.locale)); const m = $derived(context.copy.messages);
    const bindings = $derived(CENTER_COMMANDS.flatMap(command => values[command] ? [{ command, binding: values[command] }] : []));
    const valid = $derived(validCenterBindings(bindings));
    const dirty = $derived(enabled !== baseline.shortcuts || CENTER_COMMANDS.some(command => values[command] !== (baseline.center.bindings.find(binding => binding.command === command)?.binding ?? '')));
    $effect(() => {
        if (context.settings !== baseline && !dirty) { baseline = context.settings; enabled = baseline.shortcuts; values = assignments(baseline); }
    });
    $effect(() => actions.dirty(dirty)); onDestroy(() => actions.dirty(false));
    function preview(): void {
        if (context.editable && dirty && valid) actions.preview({ type: 'shortcuts', enabled, bindings }, baseline.revision);
    }
</script>
<p>{copy.intro}</p><p>{copy.scope}</p><p>{copy.physical}</p>
<p><kbd>Q W E R T Y U I O P</kbd><br/><kbd>A S D F G H J K L</kbd><br/><kbd>Z X C V B N M</kbd></p>
<a href="https://docs.page/vypdev/copilot/browser-extension/shortcuts">{copy.guide}</a>
<form onsubmit={event => { event.preventDefault(); preview(); }}>
    {#if context.settings.revision !== baseline.revision}<p role="status">{m.draftChanged}</p>{/if}
    {#if !valid}<p role="alert">{copy.invalid}</p>{/if}
    <fieldset disabled={!context.editable}>
        <legend>{context.copy.routes.shortcuts}</legend>
        <label for="shortcuts-enabled"><input id="shortcuts-enabled" type="checkbox" bind:checked={enabled}/>{copy.enabled}</label>
        {#each CENTER_COMMANDS as command}
            <label for={`shortcut-${command}`}>{`${context.copy.routes[centerCommandRoute(command)]} — ${copy.assignment}`}</label>
            <select id={`shortcut-${command}`} bind:value={values[command]}>
                <option value="">{copy.unassigned}</option>
                <option value="Alt+Shift+A">Alt+Shift+A</option>
                <option value="Alt+Shift+B">Alt+Shift+B</option>
                <option value="Alt+Shift+C">Alt+Shift+C</option>
                <option value="Alt+Shift+D">Alt+Shift+D</option>
                <option value="Alt+Shift+E">Alt+Shift+E</option>
                <option value="Alt+Shift+F">Alt+Shift+F</option>
                <option value="Alt+Shift+G">Alt+Shift+G</option>
                <option value="Alt+Shift+H">Alt+Shift+H</option>
                <option value="Alt+Shift+I">Alt+Shift+I</option>
                <option value="Alt+Shift+J">Alt+Shift+J</option>
                <option value="Alt+Shift+K">Alt+Shift+K</option>
                <option value="Alt+Shift+L">Alt+Shift+L</option>
                <option value="Alt+Shift+M">Alt+Shift+M</option>
                <option value="Alt+Shift+N">Alt+Shift+N</option>
                <option value="Alt+Shift+O">Alt+Shift+O</option>
                <option value="Alt+Shift+P">Alt+Shift+P</option>
                <option value="Alt+Shift+Q">Alt+Shift+Q</option>
                <option value="Alt+Shift+R">Alt+Shift+R</option>
                <option value="Alt+Shift+S">Alt+Shift+S</option>
                <option value="Alt+Shift+T">Alt+Shift+T</option>
                <option value="Alt+Shift+U">Alt+Shift+U</option>
                <option value="Alt+Shift+V">Alt+Shift+V</option>
                <option value="Alt+Shift+W">Alt+Shift+W</option>
                <option value="Alt+Shift+X">Alt+Shift+X</option>
                <option value="Alt+Shift+Y">Alt+Shift+Y</option>
                <option value="Alt+Shift+Z">Alt+Shift+Z</option>
            </select>
        {/each}
        <button type="button" disabled={bindings.length === 0} onclick={() => { values = assignments({ ...baseline, center: { ...baseline.center, bindings: [] } }); }}>{copy.reset}</button>
        <button type="submit" disabled={!dirty || !valid}>{m.preview}</button>
    </fieldset>
</form>
<section aria-labelledby="shortcut-conflicts-heading"><h2 id="shortcut-conflicts-heading">{copy.conflictHeading}</h2>
    <p>{copy.native}</p><p>{copy.protected}</p><p>{copy.testing}</p></section>

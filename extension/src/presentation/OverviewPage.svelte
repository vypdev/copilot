<script lang="ts">
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { centerLocationHash } from '../domain/center_routes.ts';
    let { context, actions }: CenterRouteProps = $props();
    const m = $derived(context.copy.messages);
</script>
<p>{m.welcome}</p>
<ul class="cards">
    {#each ['features', 'appearance', 'language', 'profiles', 'data'] as destination}
        <li><a href={centerLocationHash({ route: destination })}>{context.copy.routes[destination as 'features' | 'appearance' | 'language' | 'profiles' | 'data']}</a></li>
    {/each}
</ul>
<p><span>{m.profiles}</span>: <strong>{context.settings.center.profiles.length}</strong></p>
{#if context.settings.center.selected.length === 0}<p>{m.nothingSelected}</p>{/if}
<p>{m.precedence}</p>
<button type="button" disabled={!context.editable} onclick={() => actions.preview({ type: 'preferences', values: { paused: !context.settings.paused } }, context.settings.revision)}>
    <span>{m.paused}</span>: <strong>{context.settings.paused ? m.yes : m.no}</strong>
</button>

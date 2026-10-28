<script lang="ts">
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { centerLocationHash } from '../domain/center_routes.ts';
    let { context, actions }: CenterRouteProps = $props();
    const m = $derived(context.copy.messages);
</script>
{#if context.location.route === 'welcome'}
    <p>{m.welcome}</p><a href={centerLocationHash({ route: 'appearance' })}>{m.start}</a>
    <button type="button" disabled={!context.editable} onclick={() => actions.preview({ type: 'center', values: { onboarding: 'complete' } }, context.settings.revision)}>{m.finish}</button>
{:else if context.location.route === 'help' || context.location.route === 'about'}
    <p>{m.help}</p><p>{m.local}</p>
{:else if context.location.route === 'recovery'}
    <p>{m.help}</p><button type="button" onclick={() => actions.reload()}>{m.refresh}</button>
{:else}
    <p class="notice">{m.pending}</p><p>{m.pendingExplanation}</p>
{/if}
<a href="https://docs.page/vypdev/copilot/">{m.documentation}</a>

<script lang="ts">
    import type { Component } from 'svelte';
    import type { HistoryRouteProps } from '../domain/history_ui.ts';
    import type { CenterSurface } from './center_surface.ts';
    let { context, actions, load }: HistoryRouteProps & { load: CenterSurface['loadHistory'] } = $props();
    let Page = $state.raw<Component<HistoryRouteProps> | null>(null);
    let failed = $state(false);
    $effect(() => {
        const loader = load; let current = true; Page = null; failed = false;
        void loader().then(value => { if (current) Page = value; }, () => { if (current) failed = true; });
        return () => { current = false; };
    });
</script>
{#if failed}<p role="alert">{context.copy.messages.unavailable}</p><a href="#/recovery">{context.copy.routes.recovery}</a>
{:else if Page}<Page {context} {actions}/>
{:else}<p role="status">{context.copy.messages.loading}</p>{/if}

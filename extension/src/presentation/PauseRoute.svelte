<script lang="ts">
    import type { Component } from 'svelte';
    import type { PauseRouteProps } from '../domain/pause_ui.ts';
    let { context, actions, load }: PauseRouteProps & { load(): Promise<Component<PauseRouteProps>> } = $props();
    let Page = $state.raw<Component<PauseRouteProps> | null>(null); let failed = $state(false);
    $effect(() => {
        let current = true; void load().then(value => { if (current) Page = value; }, () => { if (current) failed = true; });
        return () => { current = false; };
    });
</script>
{#if failed}<p role="alert">{context.center.messages.unavailable}</p>
{:else if Page}<Page {context} {actions}/>
{:else}<p role="status">{context.center.messages.loading}</p>{/if}

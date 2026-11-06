<script lang="ts">
    import type { Component } from 'svelte';
    import type { SessionPreferenceRouteProps } from '../domain/session_preference_ui.ts';
    let { context, actions, load }: SessionPreferenceRouteProps & { load(): Promise<Component<SessionPreferenceRouteProps>> } = $props();
    let Page = $state.raw<Component<SessionPreferenceRouteProps> | null>(null); let failed = $state(false);
    $effect(() => { let current = true; void load().then(value => { if (current) Page = value; }, () => { if (current) failed = true; }); return () => { current = false; }; });
</script>
{#if failed}<p role="alert">{context.center.messages.unavailable}</p>
{:else if Page}<Page {context} {actions}/>
{:else}<p role="status">{context.center.messages.loading}</p>{/if}

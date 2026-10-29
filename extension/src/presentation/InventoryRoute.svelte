<script lang="ts">
    import type { Component } from 'svelte';
    import type { CenterFrame } from '../domain/center_frame.ts';
    import type { CenterActions, InventoryRouteProps } from '../domain/center_ui.ts';
    import { currentCenterSettings } from '../domain/center_client_view.ts';
    let { frame, Page, loadFailed, editable, actions }: { frame: CenterFrame; Page: Component<InventoryRouteProps> | null;
        loadFailed: boolean; editable: boolean; actions: CenterActions } = $props();
    const settings = $derived(currentCenterSettings(frame.client));
    const data = $derived(frame.client.data);
    const copy = $derived(frame.copy);
</script>
{#if loadFailed}<p role="alert">{copy.messages.unavailable}</p>
{:else if Page}
    {#key `${frame.location.detail ?? ''}/${frame.draftEpoch}`}
        <Page context={{ settings, copy, editable: editable && settings !== null,
            location: frame.location, rollbackAvailable: false, connections: settings === null ? null : frame.client.connections,
            inventory: frame.inventory, hasDraft: frame.hasDraft }} {actions}/>
    {/key}
{:else}<p role="status">{copy.messages.loading}</p>{/if}
{#if data && data.state !== 'ready'}
    <p class="notice">{data.state === 'future' ? copy.messages.future : data.state === 'corrupt' ? copy.messages.corrupt : copy.messages.migration}</p>
{/if}

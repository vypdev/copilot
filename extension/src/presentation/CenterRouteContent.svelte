<script lang="ts">
    import type { Component } from 'svelte';
    import type { CenterSurface } from './center_surface.ts';
    import type { CenterFrame } from '../domain/center_frame.ts';
    import type { CenterRouteProps, InventoryRouteProps, PrivacyRouteProps, SupportRouteProps } from '../domain/center_ui.ts';
    import { privacyConnection } from '../domain/privacy_context.ts';
    import { isSupportRoute, supportStatus } from '../domain/support_context.ts';
    import { currentCenterSettings } from '../domain/center_client_view.ts';
    import InventoryRoute from './InventoryRoute.svelte';
    import ConnectionsPanel from './ConnectionsPanel.svelte';
    import RepositoryPreferencesPanel from './RepositoryPreferencesPanel.svelte';
    import HistoryRoute from './HistoryRoute.svelte';
    import PauseRoute from './PauseRoute.svelte';
    let { surface, frame, editable, busy }: { surface: CenterSurface; frame: CenterFrame; editable: boolean; busy: boolean } = $props();
    let Page = $state.raw<Component<CenterRouteProps> | null>(null);
    let Inventory = $state.raw<Component<InventoryRouteProps> | null>(null);
    let Privacy = $state.raw<Component<PrivacyRouteProps> | null>(null);
    let Support = $state.raw<Component<SupportRouteProps> | null>(null);
    let loadFailed = $state(false);
    const route = $derived(frame.location.route);
    const detail = $derived(frame.location.detail);
    const data = $derived(frame.client.data);
    const copy = $derived(frame.copy);
    const historyEditable = $derived(!frame.pauses.review && !frame.pauses.busy && frame.client.phase === 'ready' && frame.client.role === 'editor' && !frame.client.review && !frame.hasDraft
        && (frame.client.issue === null || frame.client.issue === 'invalid' || frame.client.issue === 'unchanged'));
    $effect(() => {
        const destination = route; const parameter = detail;
        let current = true; Page = null; Inventory = null; Privacy = null; Support = null; loadFailed = false;
        const failed = () => { if (current) loadFailed = true; };
        if (destination === 'features') void surface.loadInventory(parameter).then(value => { if (current) Inventory = value; }, failed);
        else if (destination === 'privacy') void surface.loadPrivacy().then(value => { if (current) Privacy = value; }, failed);
        else if (isSupportRoute(destination)) void surface.loadSupport().then(value => { if (current) Support = value; }, failed);
        else if (destination !== 'activity' && destination !== 'diagnostics' && !(destination === 'repositories' && parameter === 'pauses')) void surface.load(destination, parameter).then(value => { if (current) Page = value; }, failed);
        return () => { current = false; };
    });
</script>
{#if route === 'features'}
    <InventoryRoute {frame} Page={Inventory} {loadFailed} {editable} actions={surface.actions}/>
{:else if route === 'privacy'}
    {#if loadFailed}<p role="alert">{copy.messages.unavailable}</p>
    {:else if Privacy}<Privacy context={{ copy, inspection: frame.inspection, connection: privacyConnection(frame.client, frame.inspection.grants['github-api']),
        canInspectConnection: !busy && !frame.client.review && (frame.client.role === 'editor' || frame.client.role === 'observer') }} actions={surface.actions}/>
    {:else}<p role="status">{copy.messages.loading}</p>{/if}
    <HistoryRoute context={{ copy, view: frame.history, visits: frame.visits, route: 'privacy', editable: historyEditable }} actions={surface.actions.history} load={surface.loadHistory}/>
{:else if route === 'activity' || route === 'diagnostics'}
    <HistoryRoute context={{ copy, view: frame.history, visits: frame.visits, route, editable: historyEditable }} actions={surface.actions.history} load={surface.loadHistory}/>
{:else if isSupportRoute(route)}
    {#if loadFailed}<p role="alert">{copy.messages.unavailable}</p><a href="https://docs.page/vypdev/copilot/browser-extension/onboarding">{copy.messages.documentation}</a>
    {:else if Support}<Support context={{ copy, route, status: supportStatus(frame.client), packageIdentity: frame.packageIdentity }} actions={{ reload: surface.actions.reload }}/>
    {:else}<p role="status">{copy.messages.loading}</p>{/if}
{:else if route === 'repositories' && detail === 'pauses'}
    <PauseRoute context={{ center: copy, view: frame.pauses, editable: frame.client.role === 'editor' && !frame.client.review && !frame.hasDraft
        && !frame.history.busy && !frame.history.review && !frame.history.exportBusy && !frame.history.exportReview
        && !['claiming', 'previewing', 'committing', 'stopped'].includes(frame.client.phase) && frame.client.issue !== 'incompatible'
        && frame.pauses.reader.current && frame.pauses.reader.data?.loaded.state === 'ready' && !frame.pauses.reader.data.pending,
        available: (frame.client.role === 'editor' || frame.client.role === 'observer') && frame.client.issue !== 'incompatible' }} actions={surface.actions.pauses} load={surface.loadPauses}/>
{:else if route === 'connections' || route === 'repositories' && detail !== 'workspaces'}
    {#if route === 'repositories' && data?.settings && data.state === 'ready'}
        <RepositoryPreferencesPanel context={{ settings: data.settings, copy, editable: editable && !frame.hasDraft,
            location: frame.location, rollbackAvailable: data.rollbackAvailable, connections: frame.client.connections,
            inventory: frame.inventory, hasDraft: frame.hasDraft }} actions={surface.actions}/>
    {/if}
    {#key `${route}/${frame.draftEpoch}`}<ConnectionsPanel hasDraft={frame.hasDraft} view={frame.client.connections ?? null} locale={copy.locale} {busy}
        editable={!busy && frame.client.role === 'editor' && !frame.client.review} actions={surface.actions.connections}/>{/key}
{:else if route === 'welcome' && !currentCenterSettings(frame.client)}
    <p class="notice">{data?.state === 'future' ? copy.messages.future : data?.state === 'corrupt' ? copy.messages.corrupt : data?.state === 'migration-required' ? copy.messages.migration : copy.messages.unavailable}</p>
    <a href="#/recovery">{copy.routes.recovery}</a>
{:else if data?.settings && data.state === 'ready'}
    {#if loadFailed}<p role="alert">{copy.messages.unavailable}</p>
    {:else if Page}
        {#key `${route}/${frame.location.detail ?? ''}/${frame.draftEpoch}`}
            <Page context={{ settings: data.settings, copy, editable, location: frame.location, rollbackAvailable: data.rollbackAvailable, connections: frame.client.connections,
                inventory: frame.inventory, hasDraft: frame.hasDraft }} actions={surface.actions}/>
        {/key}
    {:else}<p role="status">{copy.messages.loading}</p>{/if}
{:else if data}
    <p class="notice">{data.state === 'future' ? copy.messages.future : data.state === 'corrupt' ? copy.messages.corrupt : copy.messages.migration}</p>
    <a href="https://docs.page/vypdev/copilot/">{copy.messages.documentation}</a>
{:else if frame.client.phase === 'ready'}<p>{copy.messages.unavailable}</p>{/if}

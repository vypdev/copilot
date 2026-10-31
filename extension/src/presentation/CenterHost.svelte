<script lang="ts">
    import { onMount, untrack } from 'svelte';
    import type { CenterSurface } from './center_surface.ts';
    import { CENTER_ROUTES, centerLocationHash } from '../domain/center_routes.ts';
    import { pauseCopy } from '../domain/pause_copy.ts';
    import { sessionPreferenceCopy } from './session_preference_copy.ts';
    import { credentialRoleCopy } from '../domain/credential_role_copy.ts';
    import { reviewCopy } from '../domain/review_copy.ts';
    import { currentCenterSettings } from '../domain/center_client_view.ts';
    import { isSupportRoute } from '../domain/support_context.ts';
    import SettingsReview from './SettingsReview.svelte';
    import CenterRouteContent from './CenterRouteContent.svelte';
    import CurrentOperationPanel from './CurrentOperationPanel.svelte';
    import HelperSamplePanel from './HelperSamplePanel.svelte';
    import { apiCacheCopy } from '../domain/api_cache_copy.ts';
    let { surface }: { surface: CenterSurface } = $props();
    let frame = $state.raw(untrack(() => surface.initial));
    const route = $derived(frame.location.route);
    const copy = $derived(frame.copy);
    const data = $derived(frame.client.data);
    const role = $derived(frame.client.role === undefined ? data?.role : frame.client.role);
    const busy = $derived((route === 'repositories' && ['pauses', 'session'].includes(frame.location.detail ?? '') ? frame.client.phase === 'claiming' || !role && frame.client.phase !== 'ready' : frame.client.phase !== 'ready') || frame.history.busy || frame.history.exportBusy || frame.pauses.busy || frame.sessionPreferences.busy || frame.cache.phase !== 'idle');
    const knownSettings = $derived(currentCenterSettings(frame.client));
    const editable = $derived(!busy && !frame.cache.open && !frame.history.review && !frame.history.exportReview && !frame.pauses.review && !frame.pauses.busy && !frame.sessionPreferences.review && data?.role === 'editor' && !frame.client.review
        && (frame.client.issue === null || frame.client.issue === 'invalid' || frame.client.issue === 'unchanged') && data.state === 'ready');
    onMount(() => surface.subscribe(value => { frame = value; }));
</script>
<div class="center" lang={copy.locale} data-theme={data?.settings?.theme} data-text={data?.settings?.center.appearance.text}
    data-motion={data?.settings?.center.appearance.motion} data-contrast={data?.settings?.center.appearance.contrast}>
    <a class="skip" href="#/overview" onclick={event => { event.preventDefault(); surface.actions.focusContent(); }}>{copy.messages.skip}</a>
    <header class="masthead"><strong>{copy.messages.title}</strong><p>{copy.messages.local}</p></header>
    <div class="layout">
        <nav aria-label={copy.messages.navigation}>
            {#each CENTER_ROUTES as destination}
                <a href={centerLocationHash({ route: destination })} aria-current={route === destination ? 'page' : undefined}>{copy.routes[destination]}</a>
            {/each}
        </nav>
        <main id="center-main" tabindex="-1" aria-busy={busy && route !== 'privacy' && route !== 'activity' && route !== 'diagnostics' && !isSupportRoute(route)}>
            <h1 tabindex="-1">{copy.routes[route]}</h1>
            <div class="toolbar">
                <span role="status">{role === 'editor' ? copy.messages.editor
                    : role === 'observer' ? copy.messages.observer : busy ? copy.messages.loading : copy.routes.recovery}</span>
                {#if role === 'observer'}<button type="button" disabled={busy} onclick={() => surface.actions.takeControl()}>{copy.messages.takeControl}</button>{/if}
                <button type="button" disabled={busy} onclick={() => surface.actions.reload()}>{copy.messages.refresh}</button>
            </div>
            {#if frame.pendingLocation}
                <section class="notice" role="alert" aria-label={copy.messages.unsaved}>
                    <p>{copy.messages.unsaved}</p>{#if frame.pauses.review?.phase === 'unknown'}<p>{pauseCopy(copy.locale).noReplay}</p>{/if}<button type="button" onclick={() => surface.actions.stay()}>{copy.messages.stay}</button>
                    {#if frame.sessionPreferences.review?.phase === 'unknown'}<p>{sessionPreferenceCopy(copy.locale).noReplay}</p>{/if}
                    {#if frame.cache.status === 'unknown'}<p>{apiCacheCopy(copy.locale).unknownHelp}</p>{/if}
                    {#if route === 'connections' || route === 'repositories'}<p>{credentialRoleCopy(copy.locale).navigation}</p>{/if}
                    <button type="button" disabled={frame.cache.phase !== 'idle' || frame.client.phase === 'committing' || frame.history.busy || frame.history.exportBusy || frame.pauses.busy || frame.sessionPreferences.busy} onclick={() => surface.actions.leave()}>{frame.cache.open ? apiCacheCopy(copy.locale).close : frame.pauses.review && frame.pauses.review.phase !== 'preview' || frame.sessionPreferences.review && frame.sessionPreferences.review.phase !== 'preview' ? pauseCopy(copy.locale).leave : copy.messages.discard}</button>
                </section>
            {/if}
            {#if frame.client.issue}<p role="alert" class="notice">{copy.issues[frame.client.issue]}</p>{/if}
            {#if frame.review}<SettingsReview view={frame.review} copy={reviewCopy(copy.locale)} actions={surface.actions}/>{/if}
            <CurrentOperationPanel view={frame.operation} center={copy} read={surface.actions.inspectOperation} available={role === 'editor' || role === 'observer'} expanded={route === 'activity' || route === 'diagnostics'}/>
            {#if route === 'diagnostics' || route === 'help'}<HelperSamplePanel view={frame.helperSample} center={copy} read={surface.actions.inspectHelpers} available={(role === 'editor' || role === 'observer') && frame.client.issue !== 'incompatible'}/>{/if}
            <CenterRouteContent {frame} {surface} {editable} {busy}/>
            {#if knownSettings}<p class="revision"><span>{copy.messages.revision}</span>: <code>{knownSettings.revision}</code></p>{/if}
        </main>
    </div>
</div>

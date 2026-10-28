<script lang="ts">
    import { onMount, untrack, type Component } from 'svelte';
    import type { CenterSurface } from './center_surface.ts';
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { CENTER_ROUTES, centerLocationHash } from '../domain/center_routes.ts';
    import { reviewCopy } from '../domain/review_copy.ts';
    import SettingsReview from './SettingsReview.svelte';
    import ConnectionsPanel from './ConnectionsPanel.svelte';
    let { surface }: { surface: CenterSurface } = $props();
    let frame = $state.raw(untrack(() => surface.initial));
    let Page = $state.raw<Component<CenterRouteProps> | null>(null);
    let loadFailed = $state(false);
    const route = $derived(frame.location.route);
    const copy = $derived(frame.copy);
    const data = $derived(frame.client.data);
    const role = $derived(frame.client.role === undefined ? data?.role : frame.client.role);
    const busy = $derived(frame.client.phase !== 'ready');
    const editable = $derived(!busy && data?.role === 'editor' && !frame.client.review
        && (frame.client.issue === null || frame.client.issue === 'invalid' || frame.client.issue === 'unchanged') && data.state === 'ready');
    onMount(() => surface.subscribe(value => { frame = value; }));
    $effect(() => {
        const destination = route;
        let current = true; Page = null; loadFailed = false;
        void surface.load(destination).then(value => { if (current) Page = value; }, () => { if (current) loadFailed = true; });
        return () => { current = false; };
    });
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
        <main id="center-main" tabindex="-1" aria-busy={busy}>
            <h1 tabindex="-1">{copy.routes[route]}</h1>
            <div class="toolbar">
                <span role="status">{role === 'editor' ? copy.messages.editor
                    : role === 'observer' ? copy.messages.observer : busy ? copy.messages.loading : copy.routes.recovery}</span>
                {#if role === 'observer'}<button type="button" disabled={busy} onclick={() => surface.actions.takeControl()}>{copy.messages.takeControl}</button>{/if}
                <button type="button" disabled={busy} onclick={() => surface.actions.reload()}>{copy.messages.refresh}</button>
            </div>
            {#if frame.pendingLocation}
                <section class="notice" role="alert" aria-label={copy.messages.unsaved}>
                    <p>{copy.messages.unsaved}</p><button type="button" onclick={() => surface.actions.stay()}>{copy.messages.stay}</button>
                    <button type="button" disabled={frame.client.phase === 'committing'} onclick={() => surface.actions.leave()}>{copy.messages.discard}</button>
                </section>
            {/if}
            {#if frame.client.issue}<p role="alert" class="notice">{copy.issues[frame.client.issue]}</p>{/if}
            {#if frame.review}<SettingsReview view={frame.review} copy={reviewCopy(copy.locale)} actions={surface.actions}/>{/if}
            {#if route === 'connections' || route === 'repositories'}
                <ConnectionsPanel view={frame.client.connections ?? null} locale={copy.locale} {busy}
                    editable={!busy && frame.client.role === 'editor' && !frame.client.review} actions={surface.actions.connections}/>
            {:else if data?.settings && data.state === 'ready'}
                {#if loadFailed}<p role="alert">{copy.messages.unavailable}</p>
                {:else if Page}
                    {#key `${route}/${frame.location.detail ?? ''}/${frame.draftEpoch}`}
                        <Page context={{ settings: data.settings, copy, editable, location: frame.location, rollbackAvailable: data.rollbackAvailable }} actions={surface.actions}/>
                    {/key}
                {:else}<p role="status">{copy.messages.loading}</p>{/if}
            {:else if data}
                <p class="notice">{data.state === 'future' ? copy.messages.future : data.state === 'corrupt' ? copy.messages.corrupt : copy.messages.migration}</p>
                <a href="https://docs.page/vypdev/copilot/">{copy.messages.documentation}</a>
            {:else if frame.client.phase === 'ready'}<p>{copy.messages.unavailable}</p>{/if}
            {#if data?.settings}<p class="revision"><span>{copy.messages.revision}</span>: <code>{data.settings.revision}</code></p>{/if}
        </main>
    </div>
</div>

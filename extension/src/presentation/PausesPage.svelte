<script lang="ts">
    import type { PauseRouteProps } from '../domain/pause_ui.ts';
    import { pauseTabRows, filterPauseTabs } from '../domain/pause_ui.ts';
    import { pauseCopy } from '../domain/pause_copy.ts';
    import PauseReview from './PauseReview.svelte';
    let { context, actions }: PauseRouteProps = $props();
    const view = $derived(context.view); const data = $derived(view.reader.current ? view.reader.data : null);
    const copy = $derived(pauseCopy(context.center.locale)); const loaded = $derived(data?.loaded);
    const writable = $derived(context.editable && !view.busy && !view.review && !!data && !data.pending);
    let filter = $state('');
</script>
<section data-native-pauses aria-busy={view.reader.phase === 'reading'}>
    <h2>{copy.title}</h2><p>{copy.introduction}</p>
    <button type="button" disabled={!context.available || view.reader.phase === 'reading'} onclick={actions.read}>{copy.read}</button>
    <p role="status" aria-live="polite">{copy.reads[view.reader.phase]}</p>
    {#if view.issue}<p role="alert">{copy.issues[view.issue]}</p>{/if}
    {#if data?.precaution}<p class="notice" data-pause-precaution>{copy.precaution}</p>{/if}
    {#if data?.pending}<p class="notice">{copy.pending}</p>{/if}
    <label for="pause-tab-filter">{copy.filter}</label><input id="pause-tab-filter" type="search" maxlength="120" bind:value={filter}/>
    {#if loaded?.state === 'ready' && data}
        {@const state = loaded.value}
        {@const tabs = pauseTabRows(data)}
        {@const visibleTabs = filterPauseTabs(tabs, filter)}
        <fieldset><legend>{copy.emergency}</legend><p>{state.emergency ? copy.on : copy.off}</p>
            <button type="button" aria-label={`${state.emergency ? copy.resume : copy.pause}: ${copy.emergency}`} disabled={!writable || state.emergency && data.precaution} onclick={() => actions.preview({ type: 'emergency', paused: !state.emergency }, state.revision)}>{state.emergency ? copy.resume : copy.pause}</button>
        </fieldset>
        {#if data.precaution}<button type="button" disabled={!writable} onclick={() => actions.preview({ type: 'adopt-observed' }, state.revision)}>{copy.adopt}</button>{/if}
        <h3>{copy.tabs}</h3>
        {#if data.targets.state !== 'ready'}<p>{copy.targetsUnavailable}</p>{:else if data.targets.limited}<p>{copy.limited}</p>{/if}
        <p role="status">{`${copy.matches}: ${visibleTabs.length} / ${tabs.length}`}</p>
        {#if visibleTabs.length}<ul>{#each visibleTabs as tab (tab.tabId)}
            <li data-native-pause-tab={tab.tabId}><strong>{tab.label ?? `${copy.tab} ${tab.tabId}`}</strong>
                <span>{tab.paused ? copy.on : copy.off}</span>{#if !tab.available}<span>{copy.unavailableTab}</span>{/if}
                <button type="button" aria-label={`${tab.paused ? copy.resume : copy.pause}: ${copy.tab} ${tab.tabId}${tab.label ? ` · ${tab.label}` : ''}`}
                    disabled={!writable || tab.paused && data.precaution} onclick={() => actions.preview({ type: 'tab', tabId: tab.tabId, paused: !tab.paused }, state.revision)}>{tab.paused ? copy.resume : copy.pause}</button>
            </li>
        {/each}</ul>{:else if tabs.length}<p>{copy.noMatches}</p>{:else if data.targets.state === 'ready'}<p>{copy.empty}</p>{/if}
    {:else if loaded && loaded.state !== 'ready'}<p class="notice">{copy.issues[loaded.state]}</p>{/if}
    <PauseReview {context} {actions}/>
    <p><span>{copy.inherited}</span> <a href="#/profiles">{context.center.routes.profiles}</a></p>
    <details><summary>{copy.technical}</summary><p>{copy.lifetime}</p><p>{copy.nativeOnly}</p></details>
</section>

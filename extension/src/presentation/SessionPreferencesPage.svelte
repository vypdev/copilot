<script lang="ts">
    import type { SessionPreferenceRouteProps } from '../domain/session_preference_ui.ts';
    import { sessionPreferenceCopy } from './session_preference_copy.ts';
    import { sessionPreferenceProvenanceCopy } from './session_preference_provenance_copy.ts';
    import SessionPreferenceEditor from './SessionPreferenceEditor.svelte';
    import SessionPreferenceReview from './SessionPreferenceReview.svelte';
    import SessionPreferenceValues from './SessionPreferenceValues.svelte';
    let { context, actions }: SessionPreferenceRouteProps = $props();
    const copy = $derived(sessionPreferenceCopy(context.center.locale)); const view = $derived(context.view);
    const data = $derived(view.reader.current ? view.reader.data : null);
    const writable = $derived(context.editable && !view.busy && !view.review && !!data && !data.pending && data.loaded.state === 'ready');
</script>
<section data-session-preferences aria-busy={view.reader.phase === 'reading'}>
    <h2>{copy.title}</h2><p>{copy.introduction}</p><p>{copy.lifetime}</p>
    <button type="button" disabled={!context.available || view.reader.phase === 'reading'} onclick={actions.read}>{copy.read}</button>
    {#if !data}<p role="status">{view.reader.phase === 'reading' ? context.center.messages.loading : copy.unavailable}</p>{/if}
    {#if view.issue}<p role="alert">{copy.issues[view.issue]}</p>{/if}
    {#if data?.precaution}<p class="notice">{copy.precaution}</p>{/if}
    {#if data?.pending}<p role="status">{copy.issues.busy}</p>{/if}
    {#if data?.source?.state === 'ready' && data.source.context.verified}<p>{`${copy.source}: ${data.source.name} · ${data.source.account} · ${data.source.repository}`}</p>
    {:else if data}<p>{copy.unverified}</p>{/if}
    {#if data && ['retained', 'unknown', 'inactive'].includes(data.restriction.reason)}<p role="status">{sessionPreferenceProvenanceCopy(context.center.locale).scopes[data.restriction.reason as 'retained' | 'unknown' | 'inactive']}</p>{/if}
    {#if data?.loaded.state === 'ready'}
        {@const revision = data.loaded.value.revision}
        <h3>{copy.observed}</h3><SessionPreferenceValues value={data.loaded.value.preferences} center={context.center}/>
        <h3>{copy.applied}</h3><SessionPreferenceValues value={data.effective} center={context.center}/>
        <button type="button" disabled={!writable || data.precaution || data.loaded.value.scope === null} onclick={() => actions.preview({ type: 'clear' }, revision)}>{copy.clear}</button>
        {#if data.precaution}<button type="button" disabled={!writable} onclick={() => actions.preview({ type: 'adopt-observed' }, revision)}>{copy.adopt}</button>{/if}
    {:else if data}<p class="notice">{copy.issues[data.loaded.state]}</p>{/if}
    <SessionPreferenceEditor {context} {actions}/><SessionPreferenceReview {context} {actions}/>
    <a href="#/profiles">{context.center.routes.profiles}</a><a href="#/repositories/pauses">{context.center.messages.paused}</a>
</section>

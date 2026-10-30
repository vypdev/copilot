<script lang="ts">
    import { onDestroy } from 'svelte';
    import type { SessionPreferenceRouteProps } from '../domain/session_preference_ui.ts';
    import { sessionPreferenceDraft, draftSessionPreferences } from '../domain/session_preference_draft.ts';
    import { sameSessionPreferenceSnapshot } from '../domain/session_preference_reply.ts';
    import { sessionPreferencePlanSourceMatches } from '../domain/session_preference_client_match.ts';
    import type { SessionPreferences } from '../domain/session_preferences.ts';
    import { sessionPreferenceCopy } from './session_preference_copy.ts';
    import SessionPreferenceFields from './SessionPreferenceFields.svelte';
    let { context, actions }: SessionPreferenceRouteProps = $props();
    const copy = $derived(sessionPreferenceCopy(context.center.locale));
    const data = $derived(context.view.reader.current ? context.view.reader.data : null);
    const signature = $derived(data ? JSON.stringify([data.source, data.settingsState, data.settingsRevision, data.loaded, data.precaution]) : null);
    let initialized = $state(false); let baseline = $state(''); let baseSource = $state<string | null>(null); let revision = $state(0);
    let draft = $state(sessionPreferenceDraft({}));
    const dirty = $derived(initialized && JSON.stringify(draft) !== baseline);
    const changed = $derived(initialized && signature !== baseSource);
    const editable = $derived(context.editable && !context.view.review && !context.view.busy && !!data && !data.pending && !data.precaution
        && data.settingsState === 'ready' && data.source?.state === 'ready' && data.source.context.verified);
    function observe(snapshot: SessionPreferences, source: string | null, keepDraft: boolean): void {
        const observed = sessionPreferenceDraft(snapshot.preferences);
        if (!keepDraft) draft = observed;
        baseline = JSON.stringify(observed); baseSource = source; revision = snapshot.revision; initialized = true;
    }
    const observedActions = $derived.by(() => {
        if (data?.loaded.state !== 'ready') return null;
        const snapshot = data.loaded.value; const source = signature;
        return { reset: () => observe(snapshot, source, false), rebase: () => observe(snapshot, source, true) };
    });
    $effect(() => {
        if (!initialized && observedActions) observedActions.reset();
        const review = context.view.review;
        if (review?.outcome?.state === 'result' && review.outcome.outcome.state === 'committed' && review.plan && data?.loaded.state === 'ready'
            && sessionPreferencePlanSourceMatches(review.plan, data) && sameSessionPreferenceSnapshot(review.plan.after, data.loaded.value)
            && JSON.stringify(draftSessionPreferences(draft)) === JSON.stringify(review.plan.after.preferences)) observedActions!.rebase();
    });
    $effect(() => actions.dirty(dirty)); onDestroy(() => actions.dirty(false));
    function preview(event: SubmitEvent): void {
        event.preventDefault(); const preferences = draftSessionPreferences(draft);
        if (editable && !changed && preferences) actions.preview({ type: 'replace', preferences }, revision);
    }
</script>
{#if initialized}
    <form onsubmit={preview} data-session-preference-editor>
        {#if changed}<p role="status">{copy.changed}</p>{/if}
        <fieldset disabled={!editable}><legend>{copy.editor}</legend>
            <SessionPreferenceFields {draft} center={context.center}/>
            <button type="submit" disabled={!dirty || changed}>{context.center.messages.preview}</button>
        </fieldset>
        {#if changed}<button type="button" disabled={!editable} onclick={observedActions?.rebase}>{copy.rebase}</button>{/if}
        <button type="button" disabled={!context.available || context.view.busy || !!context.view.review || data?.pending || data?.loaded.state !== 'ready' || !dirty && !changed} onclick={observedActions?.reset}>{copy.resetDraft}</button>
    </form>
{/if}

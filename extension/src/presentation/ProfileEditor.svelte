<script lang="ts">
    import { onDestroy, untrack } from 'svelte';
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { profileDraft, draftProfile } from '../domain/profile_draft.ts';
    import ProfileScopeFields from './ProfileScopeFields.svelte';
    let { context, actions }: CenterRouteProps = $props();
    const baseline = untrack(() => context.settings);
    const previous = untrack(() => baseline.center.profiles.find(profile => profile.id === context.location.detail));
    const original = profileDraft(previous); const originalText = JSON.stringify(original);
    let draft = $state(profileDraft(previous)); let invalid = $state(false);
    const m = $derived(context.copy.messages);
    const dirty = $derived(JSON.stringify(draft) !== originalText);
    $effect(() => actions.dirty(dirty)); onDestroy(() => actions.dirty(false));
    function preview(): void {
        const profile = draftProfile(draft, previous);
        invalid = profile === null || !previous && baseline.center.profiles.some(existing => existing.id === draft.id);
        if (profile && !invalid) actions.preview({ type: 'profile', change: { type: 'save', profile } }, baseline.revision);
    }
</script>
{#if context.location.detail && !previous}<p role="alert">{context.copy.issues.invalid}</p>
{:else}
    <form onsubmit={event => { event.preventDefault(); preview(); }}>
        {#if invalid}<p role="alert">{context.copy.issues.invalid}</p>{/if}
        {#if context.settings.revision !== baseline.revision}<p role="status">{m.draftChanged}</p>{/if}
        <fieldset disabled={!context.editable || (!previous && baseline.center.profiles.length >= 10)}>
            <legend>{previous ? previous.name : m.newProfile}</legend>
            <label for="profile-id">{m.identifier}</label><input id="profile-id" type="text" required maxlength="48" pattern={'[a-z][a-z0-9\\-]{0,47}'} aria-describedby="profile-id-hint" title={m.identifierHint} readonly={!!previous} bind:value={draft.id}>
            <p id="profile-id-hint">{m.identifierHint}</p>
            <label for="profile-name">{m.name}</label><input id="profile-name" type="text" required maxlength="60" bind:value={draft.name}>
            <ProfileScopeFields {draft} copy={context.copy}/>
            <button type="submit" disabled={!dirty}>{m.preview}</button>
        </fieldset>
    </form>
{/if}

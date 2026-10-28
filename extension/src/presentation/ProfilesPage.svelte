<script lang="ts">
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { centerLocationHash } from '../domain/center_routes.ts';
    import { profileScopeKey } from '../domain/center_profiles.ts';
    import ProfileEditor from './ProfileEditor.svelte';
    import ProfileEffectiveState from './ProfileEffectiveState.svelte';
    let { context, actions }: CenterRouteProps = $props();
    const m = $derived(context.copy.messages);
    let editingDraft = $state(false);
    const editorActions = $derived({ ...actions, dirty: (value: boolean) => { editingDraft = value; actions.dirty(value); } });
</script>
<p>{m.profileLimit}</p><p>{m.precedence}</p>
<ProfileEffectiveState {context}/>
{#if !context.location.detail}
    <ul class="cards">
        {#each context.settings.center.profiles as profile (profile.id)}
            <li>
                <h2><a href={centerLocationHash({ route: 'profiles', detail: profile.id })}>{profile.name}</a></h2>
                <p>{profileScopeKey(profile.scope)}</p><p>{context.settings.center.selected.includes(profile.id) ? m.selected : m.inactive}</p>
                <button type="button" disabled={!context.editable || editingDraft} onclick={() => actions.preview({ type: 'profile', change: {
                    type: context.settings.center.selected.includes(profile.id) ? 'deselect' : 'select', id: profile.id } }, context.settings.revision)}>
                    {context.settings.center.selected.includes(profile.id) ? m.deselect : m.select}
                </button>
                <button type="button" disabled={!context.editable || editingDraft} onclick={() => actions.preview({ type: 'profile', change: { type: 'remove', id: profile.id } }, context.settings.revision)}>{m.remove}</button>
            </li>
        {/each}
    </ul><p>{m.removeHint}</p>{#if editingDraft}<p role="status">{m.draftPending}</p>{/if}
{/if}
<ProfileEditor {context} actions={editorActions}/>

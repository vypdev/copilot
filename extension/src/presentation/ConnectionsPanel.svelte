<script lang="ts">
    import type { ConnectionPanelProps } from '../domain/connection_ui.ts';
    import { connectionCopy } from '../domain/connection_copy.ts';
    import RepositoryRelocation from './RepositoryRelocation.svelte';
    import { captureRelocation, type RelocationTarget } from '../domain/repository_relocation.ts';
    import { relocationCopy } from '../domain/relocation_copy.ts';
    import ConnectionForm from './ConnectionForm.svelte';
    import { credentialRoleCopy } from '../domain/credential_role_copy.ts';
    import OptionalRoleStates from './OptionalRoleStates.svelte';
    import RoleSelectionReview from './RoleSelectionReview.svelte';
    import type { ConnectionSummary } from '../domain/named_sessions.ts';
    let { view, locale, editable, busy, actions, hasDraft = false }: ConnectionPanelProps = $props();
    const copy = $derived(connectionCopy(locale));
    const roles = $derived(credentialRoleCopy(locale));
    const ready = $derived(view?.state === 'ready' ? view : null);
    let removal = $state<{ id: string; revision: number } | null>(null);
    let forgetAll = $state(false);
    let relocation = $state<RelocationTarget | null>(null);
    let selection = $state<RelocationTarget | null>(null);
    const canSelect = $derived(editable && !busy && !removal && !forgetAll && !relocation && !selection && !hasDraft);
    function choose(target: ConnectionSummary): void {
        if (!canSelect || !ready || !ready.entries.includes(target)) return;
        if (target.role === 'repository-read') actions.change({ type: 'select', id: target.id }, ready.revision);
        else { selection = captureRelocation(target, ready.revision); actions.dirty(true); }
    }
    function closeSelection(target: RelocationTarget | null): void {
        if (target === null || selection !== target) return;
        const id = target.entry.id; selection = null; actions.dirty(false); actions.focusSession(id);
    }
    $effect(() => { if (removal && removal.revision !== ready?.revision) removal = null; });
</script>
<section aria-labelledby="connections-heading">
    <h2 id="connections-heading">{copy.title}</h2><p>{copy.privacy}</p><p>{copy.scope}</p>
    <OptionalRoleStates {ready} copy={roles} disabled={!editable || busy || !!removal || forgetAll || !!relocation || !!selection || hasDraft} {actions}/>
    <p role="status">{busy ? copy.pending : ready ? (ready.connected ? copy.connected : copy.disconnected) : copy.unavailable}</p>
    {#if view && view.state !== 'ready'}<p role="alert">{copy.outcomes[view.state]}</p>{/if}
    <button type="button" disabled={busy} onclick={() => actions.refresh()}>{copy.refresh}</button>
    {#if forgetAll}
        <div class="notice" role="alert"><p>{copy.revokeHint}</p>
            <button type="button" disabled={!editable || busy} onclick={() => { actions.change({ type: 'revoke-all' }, ready?.revision ?? 0); forgetAll = false; }}>{copy.confirmAll}</button>
            <button type="button" disabled={busy} onclick={() => { forgetAll = false; }}>{copy.cancel}</button>
        </div>
    {:else}<button type="button" disabled={!editable || busy || !!removal || !!relocation || !!selection} onclick={() => { forgetAll = true; }}>{copy.revokeAll}</button>{/if}
    {#if relocation}<RepositoryRelocation target={relocation} {view} {locale} {editable} {busy} {actions} close={() => { relocation = null; }}/>{/if}
    {#if selection}{@const target = selection}{#key target}<RoleSelectionReview {target} {view} {locale} {editable} {busy} {actions} close={() => closeSelection(target)}/>{/key}{/if}
    {#if hasDraft && !selection && !relocation}<p>{roles.draft}</p>{/if}
    {#if ready}
        {#if ready.entries.length >= 5}<p>{copy.outcomes.capacity}</p>{/if}
        {#if ready.entries.length === 0}<p>{copy.empty}</p>{/if}
        <ul class="cards">
            {#each ready.entries as entry (entry.id)}
                <li><h3>{entry.name}</h3><p><span>{entry.viewerLogin}</span> · <code>{entry.viewerId}</code></p>
                    <p><span>{entry.repository}</span> · <code>{entry.repositoryId}</code></p><p>{roles.labels[entry.role]}</p>
                    <p>{entry.role === 'repository-read' ? ready.connected && ready.selected === entry.id ? copy.connected : copy.disconnected
                        : ready.optionalWrites?.[entry.role].selected === entry.id ? roles.states[ready.optionalWrites[entry.role].state] : roles.unselected}</p>
                    <button id={`connection-select-${entry.id}`} type="button" disabled={!canSelect} onclick={() => choose(entry)}>{entry.role === 'repository-read' ? copy.select : roles.review}</button>
                    <button type="button" disabled={!editable || busy || !!removal || forgetAll || !!relocation || !!selection} onclick={() => { removal = { id: entry.id, revision: ready.revision }; }}>{copy.remove}</button>
                    <button type="button" disabled={!editable || busy || !!removal || forgetAll || !!relocation || !!selection || hasDraft}
                        onclick={() => { relocation = captureRelocation(entry, ready.revision); actions.dirty(true); }}>{relocationCopy(locale).open}</button>
                    {#if removal?.id === entry.id}
                        <div class="notice" role="alert"><p>{copy.removal}</p>
                            <button type="button" disabled={!editable || busy} onclick={() => { actions.change({ type: 'remove', id: entry.id }, removal!.revision); }}>{copy.confirm}</button>
                            <button type="button" disabled={busy} onclick={() => { removal = null; }}>{copy.cancel}</button>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
        {#if ready.selected}<button type="button" disabled={!editable || busy || !!removal || forgetAll || !!relocation || !!selection} onclick={() => actions.change({ type: 'disconnect' }, ready.revision)}>{copy.disconnect}</button>{/if}
    {/if}
    <ConnectionForm {copy} {roles} disabled={!editable || busy || !ready || ready.entries.length >= 5 || !!removal || forgetAll || !!relocation || !!selection} {actions}/>
</section>

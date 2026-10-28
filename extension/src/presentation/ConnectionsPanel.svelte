<script lang="ts">
    import type { ConnectionPanelProps } from '../domain/connection_ui.ts';
    import { connectionCopy } from '../domain/connection_copy.ts';
    import ConnectionForm from './ConnectionForm.svelte';
    let { view, locale, editable, busy, actions }: ConnectionPanelProps = $props();
    const copy = $derived(connectionCopy(locale));
    const ready = $derived(view?.state === 'ready' ? view : null);
    let removal = $state<{ id: string; revision: number } | null>(null);
    let forgetAll = $state(false);
    $effect(() => { if (removal && removal.revision !== ready?.revision) removal = null; });
</script>
<section aria-labelledby="connections-heading">
    <h2 id="connections-heading">{copy.title}</h2><p>{copy.privacy}</p><p>{copy.scope}</p>
    <p role="status">{busy ? copy.pending : ready ? (ready.connected ? copy.connected : copy.disconnected) : copy.unavailable}</p>
    {#if view && view.state !== 'ready'}<p role="alert">{copy.outcomes[view.state]}</p>{/if}
    <button type="button" disabled={busy} onclick={() => actions.refresh()}>{copy.refresh}</button>
    {#if forgetAll}
        <div class="notice" role="alert"><p>{copy.revokeHint}</p>
            <button type="button" disabled={!editable || busy} onclick={() => { actions.change({ type: 'revoke-all' }, ready?.revision ?? 0); forgetAll = false; }}>{copy.confirmAll}</button>
            <button type="button" disabled={busy} onclick={() => { forgetAll = false; }}>{copy.cancel}</button>
        </div>
    {:else}<button type="button" disabled={!editable || busy || !!removal} onclick={() => { forgetAll = true; }}>{copy.revokeAll}</button>{/if}
    {#if ready}
        {#if ready.entries.length === 0}<p>{copy.empty}</p>{/if}
        <ul class="cards">
            {#each ready.entries as entry (entry.id)}
                <li><h3>{entry.name}</h3><p><span>{entry.viewerLogin}</span> · <code>{entry.viewerId}</code></p>
                    <p><span>{entry.repository}</span> · <code>{entry.repositoryId}</code></p><p>{copy.role}</p>
                    <p>{ready.connected && ready.selected === entry.id ? copy.connected : copy.disconnected}</p>
                    <button type="button" disabled={!editable || busy || !!removal || forgetAll} onclick={() => actions.change({ type: 'select', id: entry.id }, ready.revision)}>{copy.select}</button>
                    <button type="button" disabled={!editable || busy || !!removal || forgetAll} onclick={() => { removal = { id: entry.id, revision: ready.revision }; }}>{copy.remove}</button>
                    {#if removal?.id === entry.id}
                        <div class="notice" role="alert"><p>{copy.removal}</p>
                            <button type="button" disabled={!editable || busy} onclick={() => { actions.change({ type: 'remove', id: entry.id }, removal!.revision); }}>{copy.confirm}</button>
                            <button type="button" disabled={busy} onclick={() => { removal = null; }}>{copy.cancel}</button>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
        {#if ready.selected}<button type="button" disabled={!editable || busy || !!removal || forgetAll} onclick={() => actions.change({ type: 'disconnect' }, ready.revision)}>{copy.disconnect}</button>{/if}
    {/if}
    <ConnectionForm {copy} disabled={!editable || busy || !ready || ready.entries.length >= 5 || !!removal || forgetAll} {actions}/>
</section>

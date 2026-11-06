<script lang="ts">
    import { onDestroy } from 'svelte';
    import type { ConnectionPanelProps } from '../domain/connection_ui.ts';
    import type { ConnectionOutcome } from '../domain/named_sessions.ts';
    import { repositoryAddress } from '../domain/named_sessions.ts';
    import { relocationSource, type RelocationTarget } from '../domain/repository_relocation.ts';
    import { relocationCopy } from '../domain/relocation_copy.ts';
    let { target, view, locale, editable, busy, actions, close }: ConnectionPanelProps & { target: RelocationTarget; close(): void } = $props();
    const copy = $derived(relocationCopy(locale));
    const source = $derived(relocationSource(view, target));
    let address = $state(''); let review = $state<{ address: string; revision: number } | null>(null);
    let requireRead = $state.raw<{ view: ConnectionOutcome | null } | null>(null);
    let pending = $state(false); let uncertain = $state(false); let alive = true;
    onDestroy(() => { alive = false; });
    const canReview = $derived(editable && !busy && !pending && !!source && repositoryAddress(address)
        && (!requireRead || view?.state === 'ready' && view !== requireRead.view));
    const currentReview = $derived(review !== null && source?.revision === review.revision && address === review.address);
    function discard(): void { actions.dirty(false); close(); }
    async function submit(): Promise<void> {
        if (!canReview || !source) return;
        if (!review || !currentReview) { review = { address, revision: source.revision }; uncertain = false; return; }
        const accepted = review; pending = true;
        try {
            const revision = await actions.change({ type: 'select', id: target.entry.id, repository: accepted.address }, accepted.revision);
            if (!alive) return;
            if (revision === accepted.revision + 1) { discard(); return; }
        } catch { /* Missing response is not evidence that verification did not happen. */ }
        if (alive) { pending = false; uncertain = true; review = null; requireRead = { view }; }
    }
</script>
<section class="notice" aria-labelledby="repository-relocation-heading" data-repository-relocation>
    <h3 id="repository-relocation-heading">{copy.title}</h3><p>{copy.hint}</p>
    <a href="https://docs.page/vypdev/copilot/browser-extension/configuration">{copy.guide}</a>
    <p><span>{copy.target}</span>: <span>{target.entry.name}</span> · <span>{source?.entry.repository ?? target.entry.repository}</span></p>
    <details><summary>{copy.details}</summary><p><span>{target.entry.viewerLogin}</span> · <code>{target.entry.viewerId}</code> · <code>{target.entry.repositoryId}</code></p></details>
    {#if pending}<p role="status">{copy.pending}</p>{/if}
    {#if uncertain}<p role="alert">{copy.unknown}</p>{/if}
    {#if !source}<p role="status">{copy.unavailable}</p>{:else if review && !currentReview}<p role="status">{copy.changed}</p>{/if}
    <form onsubmit={event => { event.preventDefault(); void submit(); }}>
        <label for="relocation-address">{copy.address}</label>
        <input id="relocation-address" bind:value={address} oninput={() => { review = null; }} required maxlength="201"
            pattern="[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+" autocomplete="off" spellcheck="false" disabled={!editable || busy || pending}/>
        {#if review}<p data-relocation-review><span>{copy.address}</span>: <strong>{review.address}</strong></p>{/if}
        <button type="submit" disabled={!canReview}>{currentReview ? copy.confirm : copy.review}</button>
        {#if review}<button type="button" disabled={busy || pending} onclick={() => { review = null; }}>{copy.editing}</button>{/if}
        <button type="button" disabled={busy || pending} onclick={discard}>{copy.cancel}</button>
    </form>
</section>

<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { credentialRoleCopy } from '../domain/credential_role_copy.ts';
    import { centerCopy } from '../domain/center_copy.ts';
    import { relocationSource, type RelocationTarget } from '../domain/repository_relocation.ts';
    import type { ConnectionPanelProps } from '../domain/connection_ui.ts';
    let { target, view, locale, editable, busy, actions, close }: ConnectionPanelProps & { target: RelocationTarget; close(): void } = $props();
    const copy = $derived(credentialRoleCopy(locale));
    const details = $derived(centerCopy(locale).messages);
    const source = $derived(relocationSource(view, target));
    const current = $derived(source?.revision === target.revision && source.entry.role !== 'repository-read' ? source : null);
    let phase = $state<'preview' | 'checking' | 'saved' | 'unknown'>('preview'); let alive = true;
    onMount(() => actions.focusReview()); onDestroy(() => { alive = false; });
    async function confirm(): Promise<void> {
        if (!current || !editable || busy || phase !== 'preview') return;
        phase = 'checking';
        let revision: number | null | void = null;
        try { revision = await actions.change({ type: 'select', id: target.entry.id }, target.revision); }
        catch { /* A missing response cannot establish that the native selection had no effect. */ }
        if (alive) phase = revision === target.revision + 1 ? 'saved' : 'unknown';
    }
</script>
<section class="notice" aria-labelledby="connection-role-review-heading" data-role-review>
    <h3 id="connection-role-review-heading" tabindex="-1">{copy.title}</h3><p>{copy.hint}</p><p>{copy.independent}</p>
    {#if current}<p><strong>{current.entry.name}</strong> · <span>{copy.labels[current.entry.role]}</span></p>
        <p><span>{current.entry.viewerLogin}</span> · <span>{current.entry.repository}</span></p>
        <details><summary>{details.technical}</summary><dl>
            <dt>{details.accountId}</dt><dd><code>{current.entry.viewerId}</code></dd>
            <dt>{details.repositoryId}</dt><dd><code>{current.entry.repositoryId}</code></dd>
            <dt>{details.revision}</dt><dd>{target.revision}</dd>
        </dl></details>
    {:else if phase === 'preview'}<p role="status">{copy.changed}</p>{/if}
    <p>{copy.grant}</p><p>{copy.availability}</p>
    {#if phase === 'checking'}<p role="status">{copy.pending}</p>{:else if phase === 'saved'}<p role="status">{copy.saved}</p>
    {:else if phase === 'unknown'}<p role="alert">{copy.unknown}</p><p>{copy.navigation}</p>{/if}
    {#if phase === 'preview'}<button type="button" disabled={!editable || busy || !current} onclick={() => void confirm()}>{copy.confirm}</button>{/if}
    {#if phase === 'unknown'}<button type="button" disabled={busy} onclick={() => { if (!busy) actions.refresh(); }}>{copy.refresh}</button>{/if}
    <button type="button" disabled={busy || phase === 'checking'} onclick={() => { if (!busy && phase !== 'checking') close(); }}>{phase === 'preview' ? copy.cancel : copy.close}</button>
</section>

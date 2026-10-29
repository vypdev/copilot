<script lang="ts">
    import type { HistoryRouteProps } from '../domain/history_ui.ts';
    import type { JournalKind } from '../domain/journal_facts.ts';
    import { historyCopy } from '../domain/history_copy.ts';
    import { historyAdmission } from '../domain/history_display.ts';
    import HistoryEntries from './HistoryEntries.svelte';
    import CollectionRestriction from './CollectionRestriction.svelte';
    let { context, actions, kind }: HistoryRouteProps & { kind: JournalKind } = $props();
    const copy = $derived(historyCopy(context.copy.locale));
    const slot = $derived(context.view.slots[kind]);
    const data = $derived(slot.current ? slot.data : null);
    const locked = $derived(!context.editable || context.view.busy || !!context.view.review || !!context.view.exportReview || context.view.exportBusy);
</script>
<section class="history-panel" aria-labelledby={`history-${kind}-heading`} aria-busy={slot.phase === 'reading'} data-history={kind}>
    <h2 id={`history-${kind}-heading`}>{copy.text[kind]}</h2>
    <p>{copy.text[kind === 'diagnostics' ? 'diagnosticIntro' : 'recentIntro']}</p>
    <p><span>{copy.text.scope}</span>: <span>{copy.text.scopeValue}</span></p>
    <button type="button" disabled={slot.phase === 'reading'} onclick={() => actions.read(kind)}>{copy.text.read}</button>
    {#if !data}<p role="status" aria-live="polite">{copy.text[slot.phase === 'ready' ? 'unavailable' : slot.phase]}</p>{/if}
    {#if data}
        <dl data-history-consent><dt>{copy.text.preference}</dt><dd>{copy.text[data.collection.preference]}</dd>
            <dt>{copy.text.policy}</dt><dd>{data.collection.policy === 'active' ? copy.text.active : data.collection.policy === 'paused' ? copy.text.paused
                : data.collection.policy === 'unavailable' ? copy.text.unknown : copy.issues[data.collection.policy]}</dd>
            <dt>{copy.text.admission}</dt><dd>{historyAdmission(data, copy)}</dd></dl>
        {#if data.writer.incomplete}<p class="notice" data-history-gap>{copy.text.gap}</p>{/if}
        {#if data.writer.pending > 0}<p role="status"><span>{copy.text.pending}</span>: <span>{data.writer.pending}</span></p>{/if}
        {#if data.collection.restriction}<CollectionRestriction value={data.collection.restriction} {copy} center={context.copy}/>{/if}
        <div class="actions">
            <button type="button" disabled={locked || data.collection.busy || data.collection.globallyPaused !== false || data.collection.preference === 'unknown'} onclick={() => actions.preview(kind, 'start')}>{copy.text.enable}</button>
            <button type="button" disabled={locked || data.collection.busy} onclick={() => actions.preview(kind, 'stop')}>{copy.text.stop}</button>
            <button type="button" disabled={locked || data.collection.collecting || data.collection.policy !== 'paused' || data.retained.state !== 'ready'} onclick={() => actions.clear(kind)}>{copy.text.clear}</button>
            <button type="button" disabled={context.view.busy || !!context.view.review || !!context.view.exportReview || context.view.exportBusy || data.retained.state !== 'ready'} onclick={() => actions.previewExport(kind)}>{copy.text.export}</button>
        </div>
        {#if data.retained.state === 'ready'}<HistoryEntries snapshot={data.retained.snapshot} {copy} center={context.copy}/>
        {:else}<p class="notice">{data.retained.state === 'unavailable' ? copy.text.unavailable : copy.issues[data.retained.state]}</p>{/if}
        <details><summary>{copy.text.details}</summary><dl>
            <dt>{copy.text.epoch}</dt><dd>{data.writer.epoch ?? copy.text.unknown}</dd>
            <dt>{copy.text.revision}</dt><dd>{data.writer.observedRevision ?? copy.text.unknown}</dd>
            <dt>{copy.text.dropped}</dt><dd>{data.writer.dropped}</dd></dl></details>
    {/if}
</section>

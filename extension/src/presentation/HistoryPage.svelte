<script lang="ts">
    import type { HistoryRouteProps } from '../domain/history_ui.ts';
    import { historyCopy } from '../domain/history_copy.ts';
    import HistoryPanel from './HistoryPanel.svelte';
    import HistoryReview from './HistoryReview.svelte';
    let { context, actions }: HistoryRouteProps = $props();
    const copy = $derived(historyCopy(context.copy.locale));
</script>
<div class="history-page">
    {#if context.view.issue}<p class="notice" role="alert">{copy.issues[context.view.issue]}</p>{/if}
    <HistoryReview {context} {actions}/>
    {#if context.view.exportReview}
        <section aria-labelledby="history-export-heading" aria-busy={context.view.exportBusy}>
            <h2 id="history-export-heading" tabindex="-1">{copy.text.exportTitle}</h2>
            <p><span>{copy.text[context.view.exportReview.kind]}</span> · <span>{copy.text.scopeValue}</span></p><p>{copy.text.exportScope}</p>
            <textarea aria-label={copy.text.exportTitle} readonly value={context.view.exportReview.content}></textarea>
            {#if context.view.exportFailed}<p role="alert">{copy.text.downloadFailed}</p>{/if}
            <div class="actions"><button type="button" disabled={context.view.exportBusy} onclick={() => actions.downloadExport()}>{copy.text.download}</button>
                <button type="button" disabled={context.view.exportBusy} onclick={() => actions.cancelExport()}>{copy.text.cancel}</button></div>
        </section>
    {/if}
    <HistoryPanel {context} {actions} kind="diagnostics"/>
    {#if context.route !== 'diagnostics'}<HistoryPanel {context} {actions} kind="recents"/>{/if}
    <a href="https://docs.page/vypdev/copilot/browser-extension/local-history">{copy.text.guide}</a>
    <a href="#/recovery">{copy.text.recovery}</a>
</div>

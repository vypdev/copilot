<script lang="ts">
    import { apiCacheCopy } from '../domain/api_cache_copy.ts';
    import type { ApiCacheView, ApiCacheActions } from '../domain/api_cache_ui.ts';
    let { locale, view, canReview, canInspect, actions }: { locale: string; view: ApiCacheView; canReview: boolean; canInspect: boolean; actions: ApiCacheActions } = $props();
    const copy = $derived(apiCacheCopy(locale));
    const busy = $derived(view.phase !== 'idle');
    const keep = $derived(view.retained && view.status !== 'cleared' && view.status !== 'cancelled' && view.status !== 'expired');
</script>
<section aria-labelledby="api-cache-heading" data-api-cache>
    <h2 id="api-cache-heading">{copy.title}</h2><p>{copy.scope}</p><p>{copy.preserved}</p>
    <button id="api-cache-review-button" type="button" disabled={!canReview || busy || view.open || view.retained && (view.status === 'preview' || view.status === 'not-submitted')} onclick={() => actions.preview()}>{copy.review}</button>
    {#if !canInspect}<p>{copy.observer}</p>{/if}
    {#if view.retained}<button type="button" disabled={!canInspect || busy} onclick={() => actions.inspect()}>{copy.inspect}</button>{/if}
    {#if view.open}
        <section class="notice" aria-labelledby="api-cache-review-heading" aria-busy={busy}>
            <h3 id="api-cache-review-heading" tabindex="-1">{copy.question}</h3>
            <p role="status" aria-live="polite" data-api-cache-status>{view.phase === 'confirming' ? copy.pending : view.phase === 'cancelling' ? copy.keeping
                : view.phase === 'reviewing' ? copy.reviewing : view.phase === 'reading' ? copy.reading
                    : view.status && view.status !== 'preview' ? copy.outcomes[view.status] : copy.states.reviewed}</p>
            {#if view.status === 'unknown'}<p>{copy.unknownHelp}</p>{/if}
            {#if !view.retained && view.status && view.status !== 'preview'}<p>{copy.unretained}</p>{/if}
            {#if view.status === 'preview'}<button type="button" disabled={!canReview || busy} onclick={() => actions.confirm()}>{copy.confirm}</button>{/if}
            {#if keep}<button type="button" disabled={!canInspect || busy} onclick={() => actions.cancel()}>{copy.cancel}</button>{/if}
            {#if view.status !== 'preview' && view.status !== 'not-submitted'}<button type="button" disabled={busy} onclick={() => actions.dismiss()}>{copy.close}</button>{/if}
        </section>
    {/if}
</section>

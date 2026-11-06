<script lang="ts">
    import type { HistoryRouteProps } from '../domain/history_ui.ts';
    import { historyCopy } from '../domain/history_copy.ts';
    import CollectionResult from './CollectionResult.svelte';
    let { context, actions }: HistoryRouteProps = $props();
    const copy = $derived(historyCopy(context.copy.locale));
    const review = $derived(context.view.review);
    const outcome = $derived(review?.outcome);
</script>
{#if review}
    <section class="history-review" aria-labelledby="history-review-heading" aria-busy={context.view.busy}>
        <h2 id="history-review-heading" tabindex="-1">{copy.text.review}</h2>
        <p><span>{copy.text[review.plan.kind]}</span> · <span>{copy.text.scopeValue}</span></p>
        {#if review.phase === 'preview'}
            {#if review.family === 'collection'}
                <dl><dt><span>{copy.text.before}</span> · <span>{copy.text.preference}</span></dt><dd>{copy.text[review.plan.preferenceBefore ? 'on' : 'off']}</dd>
                    <dt><span>{copy.text.after}</span> · <span>{copy.text.preference}</span></dt><dd>{copy.text[review.plan.preferenceAfter ? 'on' : 'off']}</dd>
                    <dt><span>{copy.text.before}</span> · <span>{copy.text.policy}</span></dt><dd>{copy.text[review.plan.policyBefore === 'unknown' ? 'unknown' : review.plan.policyBefore]}</dd>
                    <dt><span>{copy.text.after}</span> · <span>{copy.text.policy}</span></dt><dd>{copy.text[review.plan.policyAfter]}</dd></dl>
            {:else}<p>{copy.text.clearScope}</p><p><span>{copy.text.entries}</span>: <span>{review.plan.entries}</span></p><p>{copy.text.clearControls}</p>{/if}
        {:else if review.phase === 'committing'}<p role="status">{copy.text.submitting}</p>
        {:else if review.phase === 'cancelling'}<p role="status">{copy.text.cancelling}</p>{/if}
        {#if review.phase === 'stale' && !outcome}<p role="status">{copy.issues.stale}</p>{/if}
        {#if outcome?.state === 'settled'}<CollectionResult value={outcome} {copy} center={context.copy}/>
        {:else if outcome?.state === 'observed-cleared'}
            <p role="status"><span>{copy.text.clearScope}</span> · <span>{copy.text.verified}</span></p><p>{copy.text.historical}</p>
            <dl><dt>{copy.text.acknowledgement}</dt><dd>{copy.acknowledgements[outcome.acknowledgement]}</dd>
                <dt>{copy.text.sourceCurrent}</dt><dd>{context.copy.messages[outcome.sourceCurrentAtObservation ? 'yes' : 'no']}</dd></dl>
            <details><summary>{copy.text.details}</summary><p><span>{copy.text.epoch}</span>: <code>{outcome.epoch}</code> · <span>{copy.text.revision}</span>: <code>{outcome.revision}</code></p></details>
        {:else if outcome?.state === 'unknown'}<p role="status">{copy.text.uncertain}</p>
            <dl><dt>{copy.text.acknowledgement}</dt><dd>{copy.acknowledgements[outcome.acknowledgement]}</dd>
                <dt>{copy.text.observation}</dt><dd>{copy.observations[outcome.observation]}</dd></dl>
        {:else if outcome?.state === 'not-applied'}<p role="status">{copy.reasons[outcome.reason]}</p>
        {:else if outcome?.state === 'cancelled'}<p role="status">{copy.phases.cancelled}</p>
        {:else if outcome?.state === 'not-submitted'}<p role="status">{copy.text.notSubmitted}</p>
        {:else if outcome?.state === 'pending' || review.phase === 'unknown'}<p role="status">{copy.text.uncertain}</p>
        {:else if outcome}<p role="status">{copy.issues[outcome.state]}</p>{/if}
        <div class="actions">
            {#if review.phase === 'preview'}
                <button type="button" disabled={!context.editable || context.view.busy} onclick={() => actions.confirm()}>{copy.text.confirm}</button>
                <button type="button" disabled={context.view.busy} onclick={() => actions.cancel()}>{copy.text.cancel}</button>
            {:else}
                {#if review.phase === 'unknown' || context.view.busy}<button type="button" disabled={context.view.checking} onclick={() => actions.inspect()}>{copy.text.inspect}</button>{/if}
                <button type="button" disabled={context.view.busy} onclick={() => actions.dismiss()}>{copy.text.close}</button>
            {/if}
        </div>
        <details><summary>{copy.text.details}</summary><p><span>{copy.text.revision}</span>: <code>{review.family === 'clear' ? review.plan.revision : review.plan.settingsRevision}</code></p></details>
    </section>
{/if}

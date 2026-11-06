<script lang="ts">
    import type { PauseRouteProps } from '../domain/pause_ui.ts';
    import { pauseCopy } from '../domain/pause_copy.ts';
    import { pauseObservationCopy } from '../domain/pause_observation_copy.ts';
    import { historyCopy } from '../domain/history_copy.ts';
    import PauseScopes from './PauseScopes.svelte';
    let { context, actions }: PauseRouteProps = $props();
    const view = $derived(context.view); const review = $derived(view.review);
    const copy = $derived(pauseCopy(context.center.locale)); const facts = $derived(pauseObservationCopy(context.center.locale));
    const history = $derived(historyCopy(context.center.locale));
</script>
{#if review}
    <section aria-labelledby="pause-review-heading" aria-busy={view.busy} data-pause-review>
        <h2 id="pause-review-heading" tabindex="-1">{copy.review}</h2><p>{copy.summary}</p>
        <p role="status" aria-live="polite">{copy.phases[review.phase]}</p>
        {#if review.plan}
            {@const plan = review.plan}
            <p>{`${copy.scope}: ${plan.target.kind === 'tab' ? `${copy.tab} ${plan.target.tabId}${plan.target.label ? ` · ${plan.target.label}` : ''}` : plan.target.kind === 'emergency' ? copy.emergency : copy.adopt}`}</p>
            {#if plan.action === 'adopt-observed'}<p>{copy.adoption}</p>{/if}
            <h3>{copy.before}</h3><PauseScopes value={plan.before} precaution={plan.precautionBefore} {copy}/>
            <h3>{copy.after}</h3><PauseScopes value={plan.after} precaution={plan.precautionAfter} {copy}/>
        {/if}
        {#if review.phase === 'unknown'}<p class="notice">{copy.noReplay}</p>{/if}
        {#if review.outcome}
            {@const result = review.outcome}
            {#if result.state === 'committed' || result.state === 'reconciled' || result.state === 'unknown'}
                <p data-pause-outcome>{facts.results[result.state]}</p>
                <dl>{#if 'acknowledgement' in result}<dt>{history.text.acknowledgement}</dt><dd>{history.acknowledgements[result.acknowledgement]}</dd>{/if}
                    <dt>{history.text.observation}</dt><dd>{facts.observations[result.state === 'committed' ? 'committed' : result.state === 'reconciled' ? 'adopted' : result.observation]}</dd>
                    <dt>{history.text.sourceCurrent}</dt><dd>{context.center.messages[result.current ? 'yes' : 'no']}</dd>
                </dl>
            {:else if result.state === 'cancelled' || result.state === 'pending'}<p>{facts.results[result.state]}</p>
            {:else if result.state === 'not-submitted'}<p>{facts.states.reviewed}</p>
            {:else}<p>{copy.issues[result.state]}</p>{/if}
        {/if}
        {#if review.phase === 'preview'}
            <button type="button" disabled={!context.editable || view.busy} onclick={actions.confirm}>{copy.confirm}</button>
            <button type="button" disabled={view.busy} onclick={actions.cancel}>{copy.cancel}</button>
        {:else}
            <button type="button" disabled={!view.canInspect || view.checking} onclick={actions.inspect}>{copy.inspect}</button>
            <button type="button" disabled={view.busy} onclick={actions.dismiss}>{copy.dismiss}</button>
        {/if}
    </section>
{/if}

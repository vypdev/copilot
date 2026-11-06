<script lang="ts">
    import type { SessionPreferenceRouteProps } from '../domain/session_preference_ui.ts';
    import { sessionPreferenceCopy } from './session_preference_copy.ts';
    import { pauseCopy } from '../domain/pause_copy.ts';
    import { historyCopy } from '../domain/history_copy.ts';
    import SessionPreferenceValues from './SessionPreferenceValues.svelte';
    let { context, actions }: SessionPreferenceRouteProps = $props();
    const view = $derived(context.view); const review = $derived(view.review);
    const copy = $derived(sessionPreferenceCopy(context.center.locale)); const common = $derived(pauseCopy(context.center.locale));
    const currentSource = $derived(historyCopy(context.center.locale).text.sourceCurrent);
</script>
{#if review}
    <section aria-labelledby="session-preference-review-heading" aria-busy={view.busy} data-session-preference-review>
        <h2 id="session-preference-review-heading" tabindex="-1">{copy.review}</h2><p>{copy.summary}</p>
        <p role="status" aria-live="polite">{common.phases[review.phase]}</p>
        {#if review.plan}
            {@const plan = review.plan}
            {#if plan.source}<p>{`${copy.source}: ${plan.source.name} · ${plan.source.account} · ${plan.source.repository}`}</p>{/if}
            {#if plan.action === 'adopt-observed'}<p>{copy.adoption}</p>{/if}
            <h3>{copy.before}</h3><SessionPreferenceValues value={plan.before.preferences} center={context.center}/>
            <p>{`${common.extra}: ${context.center.messages[plan.precautionBefore ? 'yes' : 'no']}`}</p>
            <h4>{copy.applied}</h4><SessionPreferenceValues value={plan.effectiveBefore} center={context.center}/>
            <h3>{copy.after}</h3><SessionPreferenceValues value={plan.after.preferences} center={context.center}/>
            <p>{`${common.extra}: ${context.center.messages.no}`}</p>
            <h4>{copy.applied}</h4><SessionPreferenceValues value={plan.effectiveAfter} center={context.center}/>
        {/if}
        {#if review.phase === 'unknown'}<p class="notice">{copy.noReplay}</p>{/if}
        {#if review.outcome}
            {@const result = review.outcome}
            {#if result.state === 'result' || result.state === 'pending'}
                <dl><dt>{copy.submission}</dt><dd>{result.facts.attempt === 'submitted' ? copy.submitted : copy.unobserved}</dd>
                    <dt>{copy.acknowledgement}</dt><dd>{result.facts.acknowledgement === null ? copy.unobserved : copy[result.facts.acknowledgement]}</dd>
                    <dt>{copy.observation}</dt><dd>{result.facts.observation === null ? copy.unobserved : copy[result.facts.observation]}</dd>
                    {#if result.state === 'result' && 'current' in result.outcome}<dt>{currentSource}</dt><dd>{context.center.messages[result.outcome.current ? 'yes' : 'no']}</dd>{/if}
                </dl>
                {#if result.state === 'result'}<p>{['committed', 'reconciled', 'unknown', 'cancelled'].includes(result.outcome.state)
                    ? copy[result.outcome.state as 'committed' | 'reconciled' | 'unknown' | 'cancelled'] : copy.issues[result.outcome.state as keyof typeof copy.issues]}</p>{/if}
            {:else}<p>{result.state === 'not-submitted' ? copy.unobserved : copy.issues[result.state]}</p>{/if}
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

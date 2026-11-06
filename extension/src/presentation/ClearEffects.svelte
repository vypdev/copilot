<script lang="ts">
    import type { ClearFact } from '../domain/clear_fact.ts';
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    import { clearCopy } from '../domain/clear_copy.ts';
    import { clearIssue } from '../domain/clear_operation.ts';
    import { historyCopy } from '../domain/history_copy.ts';
    let { fact, center, heading = 'h3' }: { fact: ClearFact; center: CenterCopy; heading?: 'h3' | 'h4' } = $props();
    const copy = $derived(clearCopy(center.locale)); const history = $derived(historyCopy(center.locale));
</script>
<section data-clear-effects>
    <p>{copy.description}</p>
    <p><span>{copy.response}</span>: <span>{clearIssue(fact.result) ? history.issues[fact.result] : copy.results[fact.result]}</span></p>
    {#if fact.incomplete}<p class="notice">{copy.incomplete}</p>{/if}
    {#if heading === 'h4'}<h4>{copy.submission}</h4>{:else}<h3>{copy.submission}</h3>{/if}
    <p data-clear-submission>{fact.submitted ? copy.submitted : copy.notObserved}</p>
    <dl>
        <dt>{history.text.acknowledgement}</dt><dd>{fact.acknowledgement === 'not-observed' ? copy.notObserved : history.policyAcks[fact.acknowledgement]}</dd>
        <dt>{history.text.observation}</dt><dd>{copy.observations[fact.observation]}</dd>
        {#if fact.notAppliedReason !== null}<dt>{history.text.reason}</dt><dd>{history.reasons[fact.notAppliedReason]}</dd>{/if}
        {#if fact.sourceCurrentAtObservation !== null}<dt>{history.text.sourceCurrent}</dt><dd>{center.messages[fact.sourceCurrentAtObservation ? 'yes' : 'no']}</dd>{/if}
    </dl>
</section>

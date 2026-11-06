<script lang="ts">
    import type { PauseFact } from '../domain/pause_fact.ts';
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    import { pauseObservationCopy } from '../domain/pause_observation_copy.ts';
    import { historyCopy } from '../domain/history_copy.ts';
    let { fact, center, heading = 'h3' }: { fact: PauseFact; center: CenterCopy; heading?: 'h3' | 'h4' } = $props();
    const copy = $derived(pauseObservationCopy(center.locale)); const history = $derived(historyCopy(center.locale));
</script>
<section data-pause-effects>
    <p>{copy.description}</p><p data-pause-result>{copy.results[fact.result]}</p>
    {#if fact.incomplete}<p class="notice">{copy.incomplete}</p>{/if}
    {#if fact.action === 'adopt-pauses'}<p>{copy.adoption}</p>{/if}
    {#if heading === 'h4'}<h4>{copy.submission}</h4>{:else}<h3>{copy.submission}</h3>{/if}
    <p data-pause-submission>{fact.submitted ? copy.submitted : copy.notObserved}</p>
    <dl><dt>{history.text.acknowledgement}</dt><dd>{fact.acknowledgement === 'not-observed' ? copy.notObserved : history.acknowledgements[fact.acknowledgement]}</dd>
        <dt>{history.text.observation}</dt><dd>{copy.observations[fact.observation]}</dd>
        {#if fact.sourceCurrentAtObservation !== null}<dt>{history.text.sourceCurrent}</dt><dd>{center.messages[fact.sourceCurrentAtObservation ? 'yes' : 'no']}</dd>{/if}
    </dl>
</section>

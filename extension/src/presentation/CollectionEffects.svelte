<script lang="ts">
    import type { CollectionFact } from '../domain/collection_fact.ts';
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    import { collectionCopy } from '../domain/collection_copy.ts';
    import { historyCopy } from '../domain/history_copy.ts';
    let { fact, center, heading = 'h3' }: { fact: CollectionFact; center: CenterCopy; heading?: 'h3' | 'h4' } = $props();
    const copy = $derived(collectionCopy(center.locale)); const history = $derived(historyCopy(center.locale));
</script>
<section data-collection-effects>
    <p>{copy.description}</p><p><span>{copy.result}</span>: <span>{fact.result === 'pending' ? copy.waiting : fact.result === 'cancelled' ? copy.cancelled : fact.result === 'blocked' ? copy.blocked : history.reasons[fact.result]}</span></p>
    {#if fact.incomplete}<p class="notice">{copy.incomplete}</p>{/if}
    {#if heading === 'h4'}<h4>{history.text.phasePreference}</h4>{:else}<h3>{history.text.phasePreference}</h3>{/if}
    <p>{fact.preferenceRequired ? copy.preferencePhases[fact.preference.phase] : copy.notRequired}</p>
    {#if fact.preference.phase !== 'not-observed'}<dl>
        <dt>{history.text.acknowledgement}</dt><dd>{history.acknowledgements[fact.preference.acknowledgement]}</dd>
        <dt>{history.text.observation}</dt><dd>{history.observations[fact.preference.observation]}</dd>
    </dl>{/if}
    {#if fact.state === 'settled'}<p>{fact.preferenceVerifiedAtObservation ? history.text.verified : history.text.unverified}</p>{/if}
    {#each (['pause', 'activation'] as const) as phase}
        {#if heading === 'h4'}<h4>{copy[phase]}</h4>{:else}<h3>{copy[phase]}</h3>{/if}
        {#if phase === 'activation' && fact.action === 'stop'}<p>{copy.notApplicable}</p>
        {:else}<p>{copy.policyPhases[fact[phase].phase]}</p>
            {#if fact[phase].phase !== 'not-observed'}<dl>
                <dt>{history.text.acknowledgement}</dt><dd>{history.policyAcks[fact[phase].acknowledgement]}</dd>
                <dt>{history.text.observation}</dt><dd>{history.text[fact[phase].observation === 'unavailable' ? 'unknown' : fact[phase].observation]}</dd>
                <dt>{copy.attribution}</dt><dd>{center.messages[fact[phase].attributed ? 'yes' : 'no']}</dd>
                <dt>{history.text.revision}</dt><dd>{fact[phase].revision ?? history.text.unknown}</dd>
            </dl>{/if}
        {/if}
    {/each}
    {#if fact.state === 'settled'}<dl><dt>{history.text.admission}</dt><dd>{center.messages[fact.admittedAtObservation ? 'yes' : 'no']}</dd>
        <dt>{history.text.sourceCurrent}</dt><dd>{center.messages[fact.sourceCurrentAtObservation ? 'yes' : 'no']}</dd></dl>{/if}
</section>

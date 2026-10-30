<script lang="ts">
    import type { SessionFact } from '../domain/session_fact.ts';
    import { sessionCopy } from '../domain/session_copy.ts';
    let { fact, locale }: { fact: SessionFact; locale: string } = $props();
    const copy = $derived(sessionCopy(locale));
</script>
<section data-session-effects>
    <p>{copy.description}</p><p><span>{copy.result}</span>: <span>{copy.results[fact.result]}</span></p>
    {#if fact.incomplete}<p class="notice">{copy.incomplete}</p>{/if}
    {#if fact.effects.length === 0}<p>{copy.empty}</p>{:else}<ol>
        {#each fact.effects as effect (effect.ordinal)}
            <li><p><strong>{copy.effects[effect.effect]}</strong></p><p>{copy.effectStates[effect.state]}</p>
                <dl><dt>{copy.acknowledgement}</dt><dd>{copy.acknowledgements[effect.acknowledgement]}</dd>
                    <dt>{copy.observation}</dt><dd>{copy.observations[effect.observation]}</dd></dl>
            </li>
        {/each}
    </ol>{/if}
</section>

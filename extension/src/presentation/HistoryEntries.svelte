<script lang="ts">
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    import type { HistoryCopy } from '../domain/history_copy_types.ts';
    import type { JournalSnapshot } from '../domain/local_journal.ts';
    import { historyTime } from '../domain/history_display.ts';
    import { centerLocationHash } from '../domain/center_routes.ts';
    let { snapshot, copy, center }: { snapshot: JournalSnapshot; copy: HistoryCopy; center: CenterCopy } = $props();
</script>
{#if snapshot.entries.length === 0}<p>{copy.text.empty}</p>
{:else}<ol class="history-entries" reversed>
    {#each [...snapshot.entries].reverse() as entry (entry.sequence)}
        {@const time = historyTime(entry.at, center.locale)}
        <li data-history-entry={entry.sequence}>
            <p><span>{copy.text.firstObserved}</span>: {#if time}<time datetime={time.iso}>{time.label}</time>{:else}{copy.text.timeUnavailable}{/if}</p>
            {#if entry.fact.kind === 'operation'}
                <h3>{copy.actions[entry.fact.action]}</h3>
                <dl><dt>{copy.text.intent}</dt><dd>{copy.phases[entry.fact.phase]}</dd>
                    <dt>{copy.text.acknowledgement}</dt><dd>{copy.acknowledgements[entry.fact.acknowledgement]}</dd>
                    <dt>{copy.text.observation}</dt><dd>{copy.observations[entry.fact.observation]}</dd></dl>
            {:else if entry.fact.kind === 'destination'}
                <a href={centerLocationHash({ route: entry.fact.route, ...(entry.fact.featureId ? { detail: entry.fact.featureId } : {}) })}>
                    <span>{center.routes[entry.fact.route]}</span>{#if entry.fact.featureId} · <code>{entry.fact.featureId}</code>{/if}</a>
            {:else}
                <h3>{copy.text.helper}</h3><p>{entry.fact.scope === 'active-at-observation' ? copy.text.activeHelper : copy.text.retiredHelper}</p>
                <details><summary>{copy.text.details}</summary><code>{entry.fact.helper}</code> · <code>{entry.fact.code}</code></details>
            {/if}
        </li>
    {/each}
</ol>{/if}

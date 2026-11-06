<script lang="ts">
    import type { HelperSampleView } from '../domain/helper_sample_view.ts';
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    import { helperCopy } from '../domain/helper_copy.ts';
    import { operationCopy } from '../domain/operation_copy.ts';
    import { historyTime } from '../domain/history_display.ts';
    import { historyCopy } from '../domain/history_copy.ts';
    let { view, center, read, available }: { view: HelperSampleView; center: CenterCopy; read(): void; available: boolean } = $props();
    const copy = $derived(helperCopy(center.locale)); const history = $derived(historyCopy(center.locale));
</script>
<section data-helper-sample aria-labelledby="helper-sample-heading" aria-busy={view.phase === 'reading'}>
    <h2 id="helper-sample-heading">{copy.title}</h2><p>{copy.boundary}</p>
    <p role="status" aria-live="polite">{copy.phases[view.phase]}</p>
    <button type="button" disabled={!available || view.phase === 'reading'} onclick={read}>{copy.read}</button>
    {#if view.phase === 'ready' && view.value}
        {#if view.value.state === 'sample'}
            {@const sample = view.value}{@const time = historyTime(sample.capturedAt, center.locale)}
            <p><span>{copy.captured}</span>: {#if time}<time datetime={time.iso}>{time.label}</time>{:else}{history.text.timeUnavailable}{/if}</p>
            <h3>{copy.blocked}</h3>
            {#if sample.health.blocked.length === 0}<p>{copy.noneBlocked}</p>{:else}<ul>{#each sample.health.blocked as helper}<li>{copy.helpers[helper]}</li>{/each}</ul>{/if}
            <h3>{copy.reasons}</h3>
            {#if sample.health.events.length === 0}<p>{copy.noneReasons}</p>{:else}<ol>{#each [...sample.health.events].reverse() as reason}<li>
                <strong>{copy.helpers[reason.featureId]}</strong><p>{copy.codes[reason.code]}</p><p>{copy.scopes[reason.scope]}</p>
            </li>{/each}</ol>{/if}
            {#if sample.retention.length > 0}<h3>{copy.retention}</h3><dl>{#each sample.retention as entry}
                <dt>{copy.helpers[entry.helper]}</dt><dd>{operationCopy(center.locale).retained[entry.retention]}</dd>
            {/each}</dl>{/if}
        {:else}<p>{copy[view.value.state]}</p>{/if}
    {/if}
    <a href="https://docs.page/vypdev/copilot/browser-extension/runtime" rel="noreferrer">{copy.guide}</a>
</section>

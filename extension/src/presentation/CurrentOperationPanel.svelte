<script lang="ts">
    import type { CurrentOperationView } from '../domain/current_operation.ts';
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    import { operationCopy } from '../domain/operation_copy.ts';
    import { historyCopy } from '../domain/history_copy.ts';
    import { historyTime } from '../domain/history_display.ts';
    import { centerLocationHash } from '../domain/center_routes.ts';
    import { sessionCopy } from '../domain/session_copy.ts';
    import SessionEffects from './SessionEffects.svelte';
    import CollectionEffects from './CollectionEffects.svelte';
    import { collectionCopy } from '../domain/collection_copy.ts';
    import { clearCopy } from '../domain/clear_copy.ts';
    import ClearEffects from './ClearEffects.svelte';
    import PauseEffects from './PauseEffects.svelte';
    import { pauseObservationCopy } from '../domain/pause_observation_copy.ts';
    let { view, center, read, available, expanded = false }: { view: CurrentOperationView; center: CenterCopy; read(): void; available: boolean; expanded?: boolean } = $props();
    const copy = $derived(operationCopy(center.locale)); const history = $derived(historyCopy(center.locale));
    const value = $derived(view.value?.state === 'current' ? view.value.operation : null);
</script>
<details data-current-operation open={expanded} aria-busy={view.phase === 'reading'}>
    <summary>{copy.title}</summary>
    <p>{copy.scope}</p><p role="status" aria-live="polite">{copy.status[view.phase]}</p>
    <button type="button" disabled={!available || view.phase === 'reading'} onclick={read}>{copy.read}</button>
    {#if value}
        {@const time = historyTime(value.firstObserved, center.locale)}
        <p data-operation-stage>{value.family === 'settings' ? copy.stages[value.stage] : value.family === 'sessions' ? sessionCopy(center.locale).operationStates[value.stage] : value.family === 'collection' ? collectionCopy(center.locale).states[value.stage] : value.family === 'pauses' ? pauseObservationCopy(center.locale).states[value.stage] : clearCopy(center.locale).states[value.stage]}</p>
        {#if !view.current || !value.sourceCurrent}<p class="notice">{copy.historical}</p>{/if}
        {#if value.stage === 'unknown'}<p class="notice"><span>{copy.uncertain}</span> <strong>{center.messages.refresh}</strong></p>{/if}
        <p><span>{history.text.intent}</span>: <span>{value.family === 'settings' ? history.actions[value.fact.action] : value.family === 'sessions' ? sessionCopy(center.locale).actions[value.fact.action] : value.family === 'collection' ? collectionCopy(center.locale).actions[value.fact.action] : value.family === 'pauses' ? pauseObservationCopy(center.locale).actions[value.fact.action] : clearCopy(center.locale).action}</span>
            {#if value.family === 'collection' || value.family === 'clear'} · <span>{history.text[value.fact.collection]}</span>{/if}</p>
        <p><span>{copy.target}</span>: {#if view.current && value.sourceCurrent && value.target}
            <span data-operation-target>{value.target.label ?? center.routes[value.target.location.route]}</span>
            <a href={centerLocationHash(value.target.location)}>{copy.open}</a>
            {:else}<span data-operation-target-unavailable>{copy.unavailableTarget}</span>{/if}</p>
        <p><span>{history.text.firstObserved}</span>: {#if time}<time datetime={time.iso}>{time.label}</time>{:else}{history.text.timeUnavailable}{/if}</p>
        <h2>{copy.proved}</h2>{#if value.family === 'settings'}<dl>
            <dt>{history.text.intent}</dt><dd>{history.phases[value.fact.phase]}</dd>
            <dt>{history.text.acknowledgement}</dt><dd>{history.acknowledgements[value.fact.acknowledgement]}</dd>
            <dt>{history.text.observation}</dt><dd>{history.observations[value.fact.observation]}</dd>
        </dl>{:else if value.family === 'sessions'}<SessionEffects fact={value.fact} locale={center.locale} />{:else if value.family === 'collection'}<CollectionEffects fact={value.fact} {center}/>{:else if value.family === 'pauses'}<PauseEffects fact={value.fact} {center}/>{:else}<ClearEffects fact={value.fact} {center}/>{/if}
        <dl><dt>{copy.retention}</dt><dd>{copy.retained[value.retention]}</dd></dl>
    {:else if view.value?.state === 'empty'}<p>{copy.empty}</p>{/if}
</details>

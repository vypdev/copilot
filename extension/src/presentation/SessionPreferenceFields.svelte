<script lang="ts">
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    import type { SessionPreferenceDraft, InheritedBoolean } from '../domain/session_preference_draft.ts';
    import { FEATURE_METADATA } from '../domain/feature_metadata.ts';
    import { featureText } from '../domain/feature_text.ts';
    import { sessionPreferenceCopy } from './session_preference_copy.ts';
    import InventorySelect from './InventorySelect.svelte';
    let { draft, center }: { draft: SessionPreferenceDraft; center: CenterCopy } = $props();
    const copy = $derived(sessionPreferenceCopy(center.locale)); const m = $derived(center.messages);
    let filter = $state('');
    const features = $derived(FEATURE_METADATA.filter(feature => `${feature.id} ${featureText(feature, center.locale)[0]}`.toLowerCase().includes(filter.trim().toLowerCase())));
</script>
<label for="session-density">{m.density}</label>
<InventorySelect id="session-density" selected={draft.density} emptyValue="inherit" placeholder={m.inherit}
    options={{ comfortable: m.comfortable, compact: m.compact }} change={value => { draft.density = value as SessionPreferenceDraft['density']; }}/>
{#each (['shortcuts', 'paused'] as const) as field}
    <label for={`session-${field}`}>{m[field]}</label>
    <InventorySelect id={`session-${field}`} selected={draft[field]} emptyValue="inherit" placeholder={m.inherit}
        options={{ yes: m.yes, no: m.no }} change={value => { draft[field] = value as InheritedBoolean; }}/>
{/each}
<details><summary>{copy.features}</summary>
    <label for="session-feature-filter">{copy.filter}</label><input id="session-feature-filter" type="search" maxlength="120" bind:value={filter}/>
    <p role="status">{`${features.length} / ${FEATURE_METADATA.length}`}</p>
    {#each features as feature (feature.id)}
        <label for={`session-feature-${feature.id}`}>{`${featureText(feature, center.locale)[0]} · ${feature.id}`}</label>
        <InventorySelect id={`session-feature-${feature.id}`} selected={draft.features[feature.id]} emptyValue="inherit" placeholder={m.inherit}
            options={{ yes: m.yes, no: m.no }} change={value => { draft.features[feature.id] = value as InheritedBoolean; }}/>
    {/each}
</details>

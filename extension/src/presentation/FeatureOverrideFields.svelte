<script lang="ts">
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    import type { InheritedBoolean } from '../domain/session_preference_draft.ts';
    import { FEATURE_METADATA } from '../domain/feature_metadata.ts';
    import { featureText } from '../domain/feature_text.ts';
    import { sessionPreferenceCopy } from './session_preference_copy.ts';
    import InventorySelect from './InventorySelect.svelte';
    let { prefix, center, choice, change }: { prefix: 'profile' | 'session'; center: CenterCopy;
        choice(id: string): InheritedBoolean; change(id: string, value: InheritedBoolean): void } = $props();
    const copy = $derived(sessionPreferenceCopy(center.locale)); const m = $derived(center.messages);
    let filter = $state('');
    const features = $derived(FEATURE_METADATA.filter(feature => `${feature.id} ${featureText(feature, center.locale)[0]}`.toLowerCase().includes(filter.trim().toLowerCase())));
</script>
<details><summary>{copy.features}</summary>
    <label for={`${prefix}-feature-filter`}>{copy.filter}</label><input id={`${prefix}-feature-filter`} type="search" maxlength="120" bind:value={filter}/>
    <p role="status">{`${features.length} / ${FEATURE_METADATA.length}`}</p>
    {#each features as feature (feature.id)}
        <label for={`${prefix}-feature-${feature.id}`}>{`${featureText(feature, center.locale)[0]} · ${feature.id}`}</label>
        <InventorySelect id={`${prefix}-feature-${feature.id}`} selected={choice(feature.id)} emptyValue="inherit" placeholder={m.inherit}
            options={{ yes: m.yes, no: m.no }} change={value => change(feature.id, value as InheritedBoolean)}/>
    {/each}
</details>

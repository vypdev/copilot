<script lang="ts">
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    import type { SessionPreferenceDraft, InheritedBoolean } from '../domain/session_preference_draft.ts';
    import InventorySelect from './InventorySelect.svelte';
    import FeatureOverrideFields from './FeatureOverrideFields.svelte';
    let { draft, center }: { draft: SessionPreferenceDraft; center: CenterCopy } = $props();
    const m = $derived(center.messages);
</script>
<label for="session-density">{m.density}</label>
<InventorySelect id="session-density" selected={draft.density} emptyValue="inherit" placeholder={m.inherit}
    options={{ comfortable: m.comfortable, compact: m.compact }} change={value => { draft.density = value as SessionPreferenceDraft['density']; }}/>
{#each (['shortcuts', 'paused'] as const) as field}
    <label for={`session-${field}`}>{m[field]}</label>
    <InventorySelect id={`session-${field}`} selected={draft[field]} emptyValue="inherit" placeholder={m.inherit}
        options={{ yes: m.yes, no: m.no }} change={value => { draft[field] = value as InheritedBoolean; }}/>
{/each}
<FeatureOverrideFields prefix="session" {center} choice={id => draft.features[id]} change={(id, choice) => { draft.features[id] = choice; }}/>

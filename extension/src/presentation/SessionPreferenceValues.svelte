<script lang="ts">
    import type { Preferences } from '../domain/preferences.ts';
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    import { FEATURE_METADATA } from '../domain/feature_metadata.ts';
    import { featureText } from '../domain/feature_text.ts';
    import { sessionPreferenceCopy } from './session_preference_copy.ts';
    let { value, center }: { value: Partial<Preferences> | null; center: CenterCopy } = $props();
    const m = $derived(center.messages); const copy = $derived(sessionPreferenceCopy(center.locale));
    const features = $derived(FEATURE_METADATA.filter(feature => value?.features && Object.hasOwn(value.features, feature.id)));
</script>
{#if value}
    <dl>{#each (['density', 'shortcuts', 'paused'] as const) as field}
        <dt>{m[field]}</dt><dd>{value[field] === undefined ? m.inherit : field === 'density' ? m[value.density!] : m[value[field] ? 'yes' : 'no']}</dd>
    {/each}</dl>
    {#if features.length}<details><summary>{`${copy.features} · ${features.length}`}</summary><dl>
        {#each features as feature (feature.id)}<dt>{`${featureText(feature, center.locale)[0]} · ${feature.id}`}</dt><dd>{m[value.features![feature.id] ? 'yes' : 'no']}</dd>{/each}
    </dl></details>{:else}<p>{copy.empty}</p>{/if}
{:else}<p>{copy.unavailable}</p>{/if}

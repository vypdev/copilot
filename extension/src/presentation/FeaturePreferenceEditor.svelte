<script lang="ts">
    import type { InventoryRouteProps } from '../domain/center_ui.ts';
    import type { InventoryFeature } from '../domain/feature_inventory.ts';
    import { featurePreferenceIntent } from '../domain/feature_inventory.ts';
    import type { InventoryCopy } from '../domain/inventory_copy.ts';
    import InventorySelect from './InventorySelect.svelte';
    let { context, actions, feature, copy }: InventoryRouteProps & { feature: InventoryFeature; copy: InventoryCopy } = $props();
    let choice = $state('inherit'); let initialized = $state(false); let dirty = $state(false); let baseRevision = $state(0);
    $effect(() => {
        if (!dirty && context.settings !== null) {
            choice = Object.hasOwn(context.settings.features, feature.id) ? context.settings.features[feature.id] ? 'enabled' : 'disabled' : 'inherit';
            baseRevision = context.settings.revision; initialized = true;
        }
    });
    function review(event: SubmitEvent): void {
        event.preventDefault();
        if (!context.editable) return;
        const intent = featurePreferenceIntent(feature.id, choice);
        if (intent) actions.preview(intent, baseRevision);
    }
</script>
{#if initialized && (context.settings !== null || dirty)}
<form onsubmit={review}>
    <fieldset disabled={!context.editable}><legend>{copy.globalSetting}</legend>
        <label for="feature-global-preference">{feature.title}</label>
        <InventorySelect id="feature-global-preference" selected={choice} emptyValue="inherit" placeholder={copy.inherit}
            options={{ enabled: copy.enabled, disabled: copy.disabled }} change={value => { choice = value; dirty = true; actions.dirty(true); }} />
        <button type="submit">{copy.review}</button>
    </fieldset>
</form>
{/if}

<script lang="ts">
    import { untrack } from 'svelte';
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import type { InventoryFeature } from '../domain/feature_inventory.ts';
    import { featurePreferenceIntent } from '../domain/feature_inventory.ts';
    import type { InventoryCopy } from '../domain/inventory_copy.ts';
    import InventorySelect from './InventorySelect.svelte';
    let { context, actions, feature, copy }: CenterRouteProps & { feature: InventoryFeature; copy: InventoryCopy } = $props();
    let choice = $state(untrack(() => Object.hasOwn(context.settings.features, feature.id)
        ? context.settings.features[feature.id] ? 'enabled' : 'disabled' : 'inherit'));
    function review(event: SubmitEvent): void {
        event.preventDefault();
        if (!context.editable) return;
        const intent = featurePreferenceIntent(feature.id, choice);
        if (intent) actions.preview(intent, context.settings.revision);
    }
</script>
<form onsubmit={review}>
    <fieldset disabled={!context.editable}><legend>{copy.globalSetting}</legend>
        <label for="feature-global-preference">{feature.title}</label>
        <InventorySelect id="feature-global-preference" selected={choice} emptyValue="inherit" placeholder={copy.inherit}
            options={{ enabled: copy.enabled, disabled: copy.disabled }} change={value => { choice = value; actions.dirty(true); }} />
        <button type="submit">{copy.review}</button>
    </fieldset>
</form>

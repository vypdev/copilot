<script lang="ts">
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import type { InventoryFeature } from '../domain/feature_inventory.ts';
    import { featureFavoriteIntent } from '../domain/feature_inventory.ts';
    import type { InventoryCopy } from '../domain/inventory_copy.ts';
    let { context, actions, feature, copy }: CenterRouteProps & { feature: InventoryFeature; copy: InventoryCopy } = $props();
    const full = $derived(!feature.favorite && context.settings.center.favorites.length >= 20);
    function review(): void {
        if (!context.editable || context.hasDraft) return;
        const intent = featureFavoriteIntent(context.settings, feature.id);
        if (intent) actions.preview(intent, context.settings.revision);
    }
</script>
<button type="button" data-feature-favorite={feature.id} aria-pressed={feature.favorite}
    disabled={!context.editable || context.hasDraft || full} onclick={review}>
    {feature.favorite ? copy.removeFavorite : copy.addFavorite}<span class="visually-hidden">{`: ${feature.title}`}</span>
</button>
{#if full}<p>{copy.favoriteLimit}</p>{/if}

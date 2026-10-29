<script lang="ts">
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { EMPTY_INVENTORY_NAVIGATION, type InventoryFilters as Filters } from '../domain/inventory_filters.ts';
    import { featureInventory, filterInventory, inventoryPage, inventoryResultText } from '../domain/feature_inventory.ts';
    import { inventoryCopy } from '../domain/inventory_copy.ts';
    import { selectedProfileContext } from '../domain/profile_context.ts';
    import { centerLocationHash } from '../domain/center_routes.ts';
    import InventoryFilters from './InventoryFilters.svelte';
    import FeatureFavorite from './FeatureFavorite.svelte';
    let { context, actions }: CenterRouteProps = $props();
    const copy = $derived(inventoryCopy(context.copy.locale));
    const navigation = $derived(context.inventory);
    const all = $derived(featureInventory(context.settings, context.connections, context.copy.locale));
    const selected = $derived(selectedProfileContext(context.connections).entry);
    const profiles = $derived(Object.fromEntries(context.settings.center.profiles.map(profile => [profile.id, profile.name])));
    const filtered = $derived(filterInventory(all, navigation.filters, copy));
    const page = $derived(inventoryPage(filtered, navigation.page));
    function change(key: keyof Filters, value: string | boolean): void {
        actions.browseInventory({ filters: { ...navigation.filters, [key]: value }, page: 1 });
    }
</script>
<p>{copy.intro}</p><p class="notice">{copy.development}</p>
<a href="https://docs.page/vypdev/copilot/browser-extension/features">{context.copy.messages.documentation}</a>
<p>{selected ? copy.selectedContext : copy.personal}</p>
{#if selected}<p>{`${selected.viewerLogin} · ${selected.repository}`}</p>{/if}
<InventoryFilters value={navigation.filters} {copy} {profiles} {change} clear={() => actions.browseInventory(EMPTY_INVENTORY_NAVIGATION)} />
<p role="status" aria-live="polite" id="inventory-results">{inventoryResultText(filtered.length, page.start, page.end, copy)}</p>
{#if filtered.length === 0}<p>{copy.empty}</p>{/if}
<ul class="cards inventory-results" aria-describedby="inventory-results">
    {#each page.features as feature (feature.id)}
        <li data-inventory-feature={feature.id}>
            <h2><a href={centerLocationHash({ route: 'features', detail: feature.id })}>{feature.title}</a></h2>
            <p>{feature.description}</p><p>{`${copy.families[feature.family]} · ${copy.modes[feature.mode]}`}</p>
            <p>{feature.phase === 'current' ? copy.current : `${copy.later} · H${feature.milestone}`}</p>
            <p>{feature.paused ? copy.paused : feature.enabled ? copy.enabled : copy.disabled}</p>
            <FeatureFavorite {context} {actions} {feature} {copy}/>
        </li>
    {/each}
</ul>
<div class="toolbar" role="group" aria-label={inventoryResultText(filtered.length, page.start, page.end, copy)}>
    <button type="button" disabled={page.current === 1} onclick={() => actions.browseInventory({ ...navigation, page: page.current - 1 })}>{copy.previous}</button>
    <span>{`${page.current} / ${page.pages}`}</span>
    <button type="button" disabled={page.current === page.pages} onclick={() => actions.browseInventory({ ...navigation, page: page.current + 1 })}>{copy.next}</button>
</div>

<script lang="ts">
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import type { InventoryFeature } from '../domain/feature_inventory.ts';
    import type { InventoryCopy } from '../domain/inventory_copy.ts';
    import { selectedProfileContext } from '../domain/profile_context.ts';
    import { centerLocationHash } from '../domain/center_routes.ts';
    let { context, feature, copy }: Pick<CenterRouteProps, 'context'> & { feature: InventoryFeature; copy: InventoryCopy } = $props();
    const selected = $derived(selectedProfileContext(context.connections).entry);
</script>
<section aria-labelledby="feature-preference-heading">
    <h3 id="feature-preference-heading">{copy.setting}</h3>
    <p>{selected ? copy.selectedContext : copy.personal}</p>
    {#if selected}<p><span>{selected.viewerLogin}</span> · <span>{selected.repository}</span></p>{/if}
    <dl>
        <dt>{copy.setting}</dt><dd data-feature-setting>{feature.paused ? copy.paused : feature.enabled ? copy.enabled : copy.disabled}</dd>
        <dt>{copy.source}</dt><dd data-feature-source><span>{copy.sources[feature.source]}</span>
            {#if feature.profileId}<span> · </span><a href={centerLocationHash({ route: 'profiles', detail: feature.profileId })}>{feature.profileName}</a>{/if}
        </dd>
    </dl>
    <p>{copy.inheritedHint}</p>
</section>

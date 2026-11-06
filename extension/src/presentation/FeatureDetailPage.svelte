<script lang="ts">
    import type { InventoryRouteProps } from '../domain/center_ui.ts';
    import { featureInventory, featureCurrentTools } from '../domain/feature_inventory.ts';
    import { inventoryCopy } from '../domain/inventory_copy.ts';
    import { centerLocationHash } from '../domain/center_routes.ts';
    import { featureReferenceLink } from '../domain/feature_links.ts';
    import FeatureFavorite from './FeatureFavorite.svelte';
    import FeatureProvenance from './FeatureProvenance.svelte';
    import FeaturePreferenceEditor from './FeaturePreferenceEditor.svelte';
    let { context, actions }: InventoryRouteProps = $props();
    const knownContext = $derived(context.settings === null ? null : { ...context, settings: context.settings });
    const copy = $derived(inventoryCopy(context.copy.locale));
    const feature = $derived(featureInventory(context.settings, context.connections, context.copy.locale).find(value => value.id === context.location.detail));
</script>
<a href="#/features">{copy.back}</a>
<a href="https://docs.page/vypdev/copilot/browser-extension/features">{context.copy.messages.documentation}</a>
{#if feature}
    <article data-feature-detail={feature.id}>
        <h2 tabindex="-1">{feature.title}</h2>
        <p class="notice">{`${feature.phase === 'current' ? copy.current : `${copy.later} · H${feature.milestone}`} · ${copy.development}`}</p>
        <h3>{copy.detail}</h3><p>{feature.description}</p>
        {#if knownContext}
            <FeatureFavorite context={knownContext} {actions} {feature} {copy}/>
            <FeatureProvenance context={knownContext} {feature} {copy}/>
        {:else}<p role="status" data-inventory-unknown>{copy.unknownHint}</p>{/if}
        <FeaturePreferenceEditor {context} {actions} {feature} {copy}/>
        <dl>
            <dt>{copy.family}</dt><dd>{copy.families[feature.family]}</dd>
            <dt>{copy.surface}</dt><dd>{#each feature.surfaces as surface}<span>{copy.surfaces[surface]}</span><br />{/each}</dd>
            <dt>{copy.mode}</dt><dd>{copy.modes[feature.mode]}</dd>
            <dt>{copy.permission}</dt><dd>{copy.permissions[feature.permission]}</dd>
            <dt>{copy.data}</dt><dd>{copy.dataSources[feature.dataSource]}</dd>
            <dt>{copy.freshness}</dt><dd>{copy.freshnessRules[feature.mode]}</dd>
            <dt>{copy.sources.default}</dt><dd>{feature.defaultEnabled ? copy.enabled : copy.disabled}</dd>
        </dl>
        <p>{copy.notGrant}</p>
        <p><a href={featureReferenceLink({ kind: 'milestone', id: feature.id })}>{`${copy.roadmap} · H${feature.milestone}`}</a></p>
        {#if feature.tools}<h3>{copy.currentTools}</h3><ul>{#each featureCurrentTools(feature.id) as route}
            <li><a href={centerLocationHash({ route })}>{context.copy.routes[route]}</a></li>{/each}</ul>{/if}
        <details><summary>{copy.technical}</summary>
            <p><code>{feature.id}</code></p><p>{copy.browsers}</p><h3>{copy.optional}</h3>
            {#if feature.optionalPermissions.length}<ul>{#each feature.optionalPermissions as permission}<li><code>{permission}</code></li>{/each}</ul>
            {:else}<p>{copy.noOptional}</p>{/if}
            <a href={featureReferenceLink({ kind: 'contract', id: feature.id })}>{copy.contract}</a>
        </details>
    </article>
{:else}<p role="alert">{context.copy.messages.unavailable}</p>{/if}

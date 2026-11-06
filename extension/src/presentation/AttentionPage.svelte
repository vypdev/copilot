<script lang="ts">
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { localAttention, LOCAL_WORK_DEPENDENCY } from '../domain/local_navigation.ts';
    import { navigationCopy } from '../domain/navigation_copy.ts';
    import { centerLocationHash } from '../domain/center_routes.ts';
    import { featureReferenceLink } from '../domain/feature_links.ts';
    let { context }: CenterRouteProps = $props();
    const copy = $derived(navigationCopy(context.copy.locale));
    const items = $derived(localAttention(context.settings));
</script>
<p>{copy.attentionIntro}</p><p class="notice">{copy.savedScope}</p>
{#if items.length === 0}<p data-local-attention-empty>{copy.emptyAttention}</p>
{:else}<ul class="cards" data-local-attention>{#each items as item}<li data-attention-kind={item.kind}>
    <h2>{copy[item.kind]}</h2>{#if item.label}<p>{item.label}</p>{/if}
    <a href={centerLocationHash(item.location)}>{`${context.copy.routes[item.destination]}${item.label ? `: ${item.label}` : ''}`}</a>
</li>{/each}</ul>{/if}
<p>{copy.notInspected}</p><p>{copy.workDependency}</p>
<a href={featureReferenceLink({ kind: 'milestone', id: LOCAL_WORK_DEPENDENCY.referenceFeature })}>{`${copy.roadmap} · H${LOCAL_WORK_DEPENDENCY.milestone}`}</a>
<ul><li><a href="#/privacy">{context.copy.routes.privacy}</a></li><li><a href="#/connections">{context.copy.routes.connections}</a></li>
    <li><a href="#/diagnostics">{context.copy.routes.diagnostics}</a></li></ul>

<script lang="ts">
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { dependencyNavigation } from '../domain/local_navigation.ts';
    import { navigationCopy } from '../domain/navigation_copy.ts';
    import { centerLocationHash } from '../domain/center_routes.ts';
    import { featureReferenceLink } from '../domain/feature_links.ts';
    let { context }: CenterRouteProps = $props();
    const copy = $derived(navigationCopy(context.copy.locale));
    const view = $derived(dependencyNavigation(context.location.route, copy.locale));
</script>
{#if view}
    <p data-dependency-intro>{context.location.route === 'copilot' ? copy.copilotIntro : copy.setupIntro}</p>
    <section aria-labelledby="dependency-tools-heading"><h2 id="dependency-tools-heading">{copy.tools}</h2>
        <ul>{#each view.tools as route}<li><a href={centerLocationHash({ route })}>{context.copy.routes[route]}</a></li>{/each}</ul>
    </section>
    <p>{`${copy.later} · H${view.milestone}`}</p><a data-dependency-plan href={featureReferenceLink({ kind: 'milestone', id: view.referenceFeature })}>{`${copy.roadmap} · H${view.milestone}`}</a>
    <section aria-labelledby="dependency-guides-heading"><h2 id="dependency-guides-heading">{copy.guides}</h2>
        <ul>{#each view.features as feature (feature.id)}<li><a href={centerLocationHash(feature.location)}>{feature.label}</a></li>{/each}</ul>
    </section>
{:else}<p role="status">{context.copy.messages.unavailable}</p>{/if}

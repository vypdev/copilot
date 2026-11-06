<script lang="ts">
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { localWorkspace, LOCAL_WORK_DEPENDENCY } from '../domain/local_navigation.ts';
    import { navigationCopy } from '../domain/navigation_copy.ts';
    import { centerLocationHash } from '../domain/center_routes.ts';
    import { featureReferenceLink } from '../domain/feature_links.ts';
    let { context }: CenterRouteProps = $props();
    const copy = $derived(navigationCopy(context.copy.locale));
    const view = $derived(localWorkspace(context.settings, copy.locale));
    const tools = ['features', 'profiles', 'shortcuts', 'privacy', 'data'] as const;
</script>
<p>{copy.workIntro}</p><p class="notice">{copy.savedScope}</p>
<section aria-labelledby="work-favorites-heading"><h2 id="work-favorites-heading">{copy.favorites}</h2>
    {#if view.favorites.length === 0}<p>{copy.emptyFavorites}</p><a href="#/features">{context.copy.routes.features}</a>
    {:else}<ul class="cards">{#each view.favorites as feature (feature.id)}<li data-work-favorite={feature.id}>
        <a href={centerLocationHash(feature.location)}>{feature.label}</a><p>{feature.milestone === 3 ? copy.current : `${copy.later} · H${feature.milestone}`}</p>
    </li>{/each}</ul>{/if}
</section>
<section aria-labelledby="work-profiles-heading"><h2 id="work-profiles-heading">{copy.profiles}</h2>
    {#if view.profiles.length === 0}<p>{copy.emptyProfiles}</p><a href="#/profiles">{context.copy.routes.profiles}</a>
    {:else}<ul>{#each view.profiles as profile}<li><a href={centerLocationHash(profile.location)}>{profile.label}</a></li>{/each}</ul>{/if}
</section>
<section aria-labelledby="work-groups-heading"><h2 id="work-groups-heading">{copy.groups}</h2>
    {#if view.groups.length === 0}<p>{copy.emptyGroups}</p><a href="#/repositories/workspaces">{context.copy.routes.repositories}</a>
    {:else}<ul class="cards">{#each view.groups as group}<li data-work-group>
        <h3><a href={centerLocationHash(group.location)}>{group.label}</a></h3><p>{`${copy.references}: ${group.references}`}</p>{#if group.selected}<p>{copy.selected}</p>{/if}
    </li>{/each}</ul>{/if}
</section>
<section aria-labelledby="work-tools-heading"><h2 id="work-tools-heading">{copy.tools}</h2>
    <ul>{#each tools as route}<li><a href={centerLocationHash({ route })}>{context.copy.routes[route]}</a></li>{/each}</ul>
</section>
<p>{copy.workDependency}</p><a href={featureReferenceLink({ kind: 'milestone', id: LOCAL_WORK_DEPENDENCY.referenceFeature })}>{`${copy.roadmap} · H${LOCAL_WORK_DEPENDENCY.milestone}`}</a>

<script lang="ts">
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { centerProfileResolution, sourceProfileName } from '../domain/profile_context.ts';
    import { profileContextCopy } from '../domain/profile_context_copy.ts';
    let { context }: Pick<CenterRouteProps, 'context'> = $props();
    const copy = $derived(profileContextCopy(context.copy.locale));
    const state = $derived(centerProfileResolution(context.settings, context.connections));
    const fields = ['density', 'shortcuts', 'paused'] as const;
</script>
<section aria-labelledby="profile-effective-heading">
    <h2 id="profile-effective-heading">{copy.effective}</h2>
    {#if state.entry}<p>{copy.selected}</p><p>{state.entry.viewerLogin}</p><p>{state.entry.repository}</p>
    {:else}<p>{copy.personal}</p>{/if}
    <p>{copy.previewHint}</p>
    <dl>
        {#each fields as field}
            <dt>{context.copy.messages[field]}</dt>
            <dd data-preference={field}><span>{field === 'density' ? context.copy.messages[state.preferences.density]
                : context.copy.messages[state.preferences[field] ? 'yes' : 'no']}</span>
                <span> · </span>
                {#if sourceProfileName(state.preferences.sources[field], context.settings)}
                    <span>{copy.profile}</span>: <span>{sourceProfileName(state.preferences.sources[field], context.settings)}</span>
                {:else}<span>{state.preferences.sources[field] === 'repository' ? copy.repository
                    : state.preferences.sources[field] === 'default' ? copy.default : copy.global}</span>{/if}
            </dd>
        {/each}
    </dl>
</section>

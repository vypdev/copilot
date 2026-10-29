<script lang="ts">
    import { onDestroy, tick } from 'svelte';
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { WELCOME_STAGES, welcomeNext, type WelcomeStage } from '../domain/welcome.ts';
    import { welcomeCopy } from '../domain/welcome_copy.ts';
    let { context, actions }: CenterRouteProps = $props();
    let revisited = $state<WelcomeStage | null>(null);
    const c = $derived(welcomeCopy(context.copy.locale));
    const saved = $derived(context.settings.center.onboarding);
    const stage = $derived(revisited ?? saved);
    const next = $derived(welcomeNext(saved));
    const selected = $derived(context.settings.center.profiles.filter(profile => context.settings.center.selected.includes(profile.id)));
    let active = true; onDestroy(() => { active = false; });
    function explore(step: WelcomeStage | null): void { revisited = step; void tick().then(() => { if (active) actions.focusContent(); }); }
</script>
<p data-welcome-saved={saved}><span>{c.progress}</span>: <strong>{c.steps[saved]}</strong></p>
<nav aria-label={c.navigation}><ol>
    {#each WELCOME_STAGES as step}<li><button type="button" aria-current={stage === step ? 'step' : undefined} onclick={() => explore(step)}>{c.steps[step]}</button></li>{/each}
</ol></nav>
<section aria-labelledby="welcome-step" data-welcome-step={stage}>
    <h2 id="welcome-step">{c.steps[stage]}</h2><p>{c.guidance[stage]}</p>
    {#if stage === 'welcome'}<ul>
        <li><a href="#/features">{c.features}</a></li><li><a href="#/appearance">{c.appearance}</a></li><li><a href="#/language">{c.language}</a></li>
    </ul>
    {:else if stage === 'profile'}
        <h3>{c.selected}</h3>
        {#if selected.length}<ul data-welcome-profiles>{#each selected as profile (profile.id)}<li>{profile.name}</li>{/each}</ul>{:else}<p>{c.empty}</p>{/if}
        <p>{c.profileMeaning}</p><a href="#/profiles">{c.profileLink}</a>
    {:else if stage === 'permissions'}<a href="#/privacy">{c.permissionLink}</a>
    {:else}<a href="#/overview">{c.overview}</a>{/if}
</section>
{#if stage !== saved}<button type="button" onclick={() => explore(null)}>{c.resume}</button>
{:else if next}<button type="button" disabled={!context.editable} onclick={() => actions.preview({ type: 'center', values: { onboarding: next } }, context.settings.revision)}>{next === 'complete' ? c.finish : c.advance}</button>
{:else}<button type="button" disabled={!context.editable} onclick={() => actions.preview({ type: 'center', values: { onboarding: 'welcome' } }, context.settings.revision)}>{c.restart}</button>{/if}
<p>{c.previewHint}</p><p>{c.boundary}</p>
<a href="#/help">{c.help}</a> · <a href="https://docs.page/vypdev/copilot/browser-extension/onboarding" rel="noreferrer">{c.guide}</a>

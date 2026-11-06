<script lang="ts">
    import { pauseCopy } from '../domain/pause_copy.ts';
    import { sessionPreferenceCopy } from './session_preference_copy.ts';
    import { workspaceCopy } from '../domain/workspace_copy.ts';
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import { repositoryPreferenceRows } from '../domain/profile_context.ts';
    import { profileContextCopy } from '../domain/profile_context_copy.ts';
    let { context, actions }: CenterRouteProps = $props();
    const copy = $derived(profileContextCopy(context.copy.locale));
    const rows = $derived(repositoryPreferenceRows(context.settings, context.connections));
</script>
<section aria-labelledby="repository-preferences-heading">
    <h2 id="repository-preferences-heading">{copy.localRepository}</h2><p>{copy.repositoryHint}</p>
    <a href="#/repositories/pauses">{pauseCopy(context.copy.locale).title}</a>
    <a href="#/repositories/session">{sessionPreferenceCopy(context.copy.locale).title}</a>
    <a href="#/repositories/workspaces">{workspaceCopy(context.copy.locale).open}</a>
    {#if context.settings.paused}<p role="status">{copy.globalPause}</p>{/if}
    {#if rows.length === 0}<p>{copy.noIdentities}</p>{/if}
    <ul class="cards">
        {#each rows as row (row.id)}
            <li><h3>{row.name}</h3><p>{row.account}</p><code>{row.id}</code>
                <p><span>{context.copy.messages.paused}</span>: <span>{context.copy.messages[row.paused ? 'yes' : 'no']}</span></p>
                <button type="button" disabled={!context.editable} onclick={() => actions.preview({ type: 'repository', repositoryId: row.id,
                    preferences: { paused: !row.paused } }, context.settings.revision)}>{row.paused ? copy.resume : copy.pause}</button>
                <button type="button" disabled={!context.editable} onclick={() => actions.preview({ type: 'reset', scope: 'repository', repositoryId: row.id }, context.settings.revision)}>{copy.reset}</button>
            </li>
        {/each}
    </ul>
</section>

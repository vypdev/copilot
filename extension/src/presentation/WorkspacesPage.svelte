<script lang="ts">
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import type { Workspace } from '../domain/workspaces.ts';
    import { workspaceCopy } from '../domain/workspace_copy.ts';
    import WorkspaceEditor from './WorkspaceEditor.svelte';
    import WorkspaceReferences from './WorkspaceReferences.svelte';
    let { context, actions }: CenterRouteProps = $props();
    const copy = $derived(workspaceCopy(context.copy.locale)); const center = $derived(context.settings.center);
    let editing = $state.raw<{ previous?: Workspace } | null>(null);
    const available = $derived(context.editable && !context.hasDraft && !editing);
    function review(change: unknown): void { if (available) actions.preview({ type: 'workspace', change }, context.settings.revision); }
</script>
<section aria-labelledby="workspaces-heading" data-workspaces>
    <a href="#/repositories">{copy.back}</a>
    <h2 id="workspaces-heading">{copy.title}</h2><p>{copy.hint}</p><p>{copy.limit}</p>
    <a href="https://docs.page/vypdev/copilot/browser-extension/configuration">{copy.guide}</a><p>{copy.export}</p><p>{copy.restore}</p>
    <button type="button" onclick={() => actions.connections.refresh()}>{copy.read}</button>
    {#if context.connections?.state === 'ready' && context.connections.entries.some(entry => entry.id === 'previous-session')}
        {@const revision = context.connections.revision}
        <p>{copy.legacy}</p><button type="button" disabled={!available} onclick={() => actions.connections.change({ type: 'select', id: 'previous-session' }, revision)}>{copy.promote}</button>
    {/if}
    {#if editing}<WorkspaceEditor {context} {actions} previous={editing.previous} close={() => { editing = null; }}/>
    {:else}
        <button type="button" disabled={!available || center.workspaces.length >= 10} onclick={() => { editing = {}; }}>{copy.create}</button>
        {#if center.workspaces.length === 0}<p>{copy.empty}</p>{/if}
        <p><span>{copy.selected}</span>: <span>{center.workspaces.find(group => group.id === center.selectedWorkspace)?.name ?? copy.none}</span></p>
        <ul class="cards">
            {#each center.workspaces as group (group.id)}
                <li><h3>{group.name}</h3><p><span>{copy.references}</span>: <span>{group.members.length}</span></p>
                    {#if center.selectedWorkspace === group.id}<p>{copy.selected}</p>{/if}
                    <button type="button" disabled={!available || center.selectedWorkspace === group.id} onclick={() => review({ type: 'select', id: group.id })}>{copy.select}</button>
                    <button type="button" disabled={!available} onclick={() => { editing = { previous: group }; }}>{copy.edit}</button>
                    <button type="button" disabled={!available} onclick={() => review({ type: 'remove', id: group.id })}>{copy.remove}</button>
                    <WorkspaceReferences workspace={group} view={context.connections} locale={context.copy.locale} editable={!!available} actions={actions.connections}/>
                    <details><summary>{copy.technical}</summary><code>{group.id}</code></details>
                </li>
            {/each}
        </ul>
        <button type="button" disabled={!available || center.selectedWorkspace === null} onclick={() => review({ type: 'clear-selection' })}>{copy.clear}</button>
        <button type="button" disabled={!available || center.workspaces.length === 0} onclick={() => review({ type: 'reset' })}>{copy.reset}</button>
    {/if}
</section>

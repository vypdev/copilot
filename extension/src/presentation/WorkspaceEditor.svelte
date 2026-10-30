<script lang="ts">
    import { onDestroy, untrack } from 'svelte';
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    import type { Workspace } from '../domain/workspaces.ts';
    import { planWorkspaceChange } from '../domain/workspace_change.ts';
    import { workspaceChoices } from '../domain/workspace_references.ts';
    import { workspaceCopy } from '../domain/workspace_copy.ts';
    let { context, actions, previous, close }: CenterRouteProps & { previous?: Workspace; close(): void } = $props();
    const baseline = untrack(() => context.settings); const original = untrack(() => previous);
    let draft = $state({ id: original?.id ?? '', name: original?.name ?? '', members: [...(original?.members ?? [])] });
    const initial = JSON.stringify(draft); const dirty = $derived(JSON.stringify(draft) !== initial);
    const copy = $derived(workspaceCopy(context.copy.locale)); const choices = $derived(workspaceChoices(draft, context.connections));
    let invalid = $state(false);
    $effect(() => actions.dirty(dirty)); onDestroy(() => actions.dirty(false));
    function review(): void {
        const plan = planWorkspaceChange({ workspaces: baseline.center.workspaces, selectedWorkspace: baseline.center.selectedWorkspace }, { type: 'save', workspace: draft });
        invalid = plan.state === 'invalid' || !original && baseline.center.workspaces.some(group => group.id === draft.id);
        if (!invalid && plan.state === 'ready') actions.preview({ type: 'workspace', change: { type: 'save', workspace: plan.next.workspaces.find(group => group.id === draft.id)! } }, baseline.revision);
    }
    function member(id: string, checked: boolean): void { draft.members = checked ? [...draft.members, id] : draft.members.filter(value => value !== id); }
</script>
<form onsubmit={event => { event.preventDefault(); review(); }} data-workspace-editor aria-labelledby="workspace-editor-heading">
    <h3 id="workspace-editor-heading">{original ? copy.edit : copy.create}</h3>
    {#if invalid}<p role="alert">{copy.invalid}</p>{/if}
    {#if context.settings.revision !== baseline.revision}<p role="status">{copy.changed}</p>{/if}
    <fieldset disabled={!context.editable} aria-labelledby="workspace-editor-heading">
        <label for="workspace-id">{copy.identifier}</label><input id="workspace-id" required maxlength="48" pattern={'[a-z][a-z0-9\\-]{0,47}'} readonly={!!original} bind:value={draft.id}/>
        <p>{copy.identifierHint}</p>
        <label for="workspace-name">{copy.name}</label><input id="workspace-name" required maxlength="60" bind:value={draft.name}/>
        <fieldset><legend>{copy.members}</legend>
            {#each choices as choice (choice.id)}
                <label for={`workspace-member-${choice.id}`}>
                    <input id={`workspace-member-${choice.id}`} type="checkbox" checked={draft.members.includes(choice.id)} disabled={!draft.members.includes(choice.id) && draft.members.length >= 20}
                        onchange={event => member(choice.id, event.currentTarget.checked)}/>
                    {#if choice.entry}<span>{choice.entry.name}</span> · <span>{choice.entry.repository}</span>
                    {:else}<span>{choice.state === 'missing' ? copy.missing : copy.unavailable}</span> · <span>{choice.slot}</span>{/if}
                </label>
                {#if !choice.entry}<details><summary>{copy.technical}</summary><code>{choice.id}</code></details>{/if}
            {/each}
        </fieldset>
        <button type="submit" disabled={!dirty}>{copy.review}</button>
        <button type="button" onclick={() => { actions.dirty(false); close(); }}>{copy.cancel}</button>
    </fieldset>
</form>

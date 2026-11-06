<script lang="ts">
    import type { Workspace } from '../domain/workspaces.ts';
    import type { ConnectionOutcome } from '../domain/named_sessions.ts';
    import type { ConnectionActions } from '../domain/connection_ui.ts';
    import { workspaceReferences } from '../domain/workspace_references.ts';
    import { workspaceCopy } from '../domain/workspace_copy.ts';
    let { workspace, view, locale, editable, actions }: { workspace: Workspace; view: ConnectionOutcome | null | undefined; locale: string; editable: boolean; actions: ConnectionActions } = $props();
    const copy = $derived(workspaceCopy(locale)); const rows = $derived(workspaceReferences(workspace, view));
</script>
<ul>
    {#each rows as row (row.id)}
        <li data-workspace-reference={row.id}>
            {#if row.state === 'saved'}<p>{copy.saved}</p><p><span>{row.entry.name}</span> · <span>{row.entry.viewerLogin}</span> · <span>{row.entry.repository}</span></p>
                {#if row.connected}<p>{copy.connected}</p>{/if}
                <button type="button" disabled={!editable} onclick={() => actions.change({ type: 'select', id: row.id }, row.revision)}>{copy.verify}</button>
            {:else}<p><span>{row.state === 'missing' ? copy.missing : copy.unavailable}</span> · <span>{row.slot}</span></p>{/if}
            <details><summary>{copy.technical}</summary><code>{row.id}</code></details>
        </li>
    {/each}
</ul>

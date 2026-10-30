import type { ConnectionOutcome, ConnectionSummary } from './named_sessions.ts';
import { bindableWorkspaceReference, type Workspace } from './workspaces.ts';
import { deepFreeze } from './value.ts';
export type WorkspaceReference = { readonly id: string; readonly slot: number } & (
    { readonly state: 'saved'; readonly entry: ConnectionSummary; readonly connected: boolean; readonly revision: number }
    | { readonly state: 'missing' | 'unavailable'; readonly entry: null; readonly connected: false; readonly revision: null });
/** Only admitted saved metadata supplies display labels; references never become connection authority. */
export function workspaceReferences(workspace: Workspace, view: ConnectionOutcome | null | undefined): readonly WorkspaceReference[] {
    return deepFreeze(workspace.members.map((id, index): WorkspaceReference => {
        const slot = index + 1;
        if (view?.state !== 'ready') return { id, slot, state: 'unavailable', entry: null, connected: false, revision: null };
        const entry = bindableWorkspaceReference(id) ? view.entries.find(entry => entry.id === id) : undefined;
        return entry ? { id, slot, state: 'saved', entry: { ...entry }, connected: view.connected && view.selected === id, revision: view.revision }
            : { id, slot, state: 'missing', entry: null, connected: false, revision: null };
    }));
}
export function workspaceChoices(workspace: Workspace, view: ConnectionOutcome | null | undefined): readonly WorkspaceReference[] {
    const ids = [...new Set([...workspace.members, ...(view?.state === 'ready' ? view.entries.filter(entry => bindableWorkspaceReference(entry.id)).map(entry => entry.id) : [])])];
    return workspaceReferences({ ...workspace, members: ids }, view);
}

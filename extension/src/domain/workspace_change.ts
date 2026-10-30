import { copyWorkspaceSelection, type WorkspaceSelection } from './workspaces.ts';
import { localIdentifier } from './center_routes.ts';
import { deepFreeze, keys, record } from './value.ts';

export type WorkspaceChangePlan = { readonly state: 'invalid'; readonly reason: 'invalid-input' | 'capacity' | 'not-found' | 'conflict' }
    | { readonly state: 'unchanged' } | { readonly state: 'ready'; readonly next: WorkspaceSelection };
/** Grouping changes no credential, repository preference, pause or remote resource. */
export function planWorkspaceChange(current: unknown, intent: unknown): WorkspaceChangePlan {
    const before = copyWorkspaceSelection(current);
    if (!before || !record(intent)) return { state: 'invalid', reason: 'invalid-input' };
    let workspaces = [...before.workspaces]; let selectedWorkspace = before.selectedWorkspace;
    if (intent.type === 'save') {
        if (!keys(intent, ['type', 'workspace']) || Object.keys(intent).length !== 2) return { state: 'invalid', reason: 'invalid-input' };
        const entry = copyWorkspaceSelection({ workspaces: [intent.workspace], selectedWorkspace: null })?.workspaces[0];
        if (!entry) return { state: 'invalid', reason: 'invalid-input' };
        const index = workspaces.findIndex(value => value.id === entry.id);
        if (index < 0 && workspaces.length >= 10) return { state: 'invalid', reason: 'capacity' };
        if (index < 0) workspaces.push(entry); else workspaces[index] = entry;
    } else if (intent.type === 'clear-selection' || intent.type === 'reset') {
        if (!keys(intent, ['type']) || Object.keys(intent).length !== 1) return { state: 'invalid', reason: 'invalid-input' };
        selectedWorkspace = null; if (intent.type === 'reset') workspaces = [];
    } else {
        if (!['select', 'remove'].includes(intent.type as string) || !keys(intent, ['type', 'id']) || Object.keys(intent).length !== 2
            || !localIdentifier(intent.id)) return { state: 'invalid', reason: 'invalid-input' };
        if (!workspaces.some(value => value.id === intent.id)) return { state: 'invalid', reason: 'not-found' };
        if (intent.type === 'select') selectedWorkspace = intent.id;
        else { workspaces = workspaces.filter(value => value.id !== intent.id); if (selectedWorkspace === intent.id) selectedWorkspace = null; }
    }
    const next = copyWorkspaceSelection({ workspaces, selectedWorkspace });
    if (!next) return { state: 'invalid', reason: 'conflict' };
    return JSON.stringify(before) === JSON.stringify(next) ? { state: 'unchanged' } : deepFreeze({ state: 'ready', next });
}

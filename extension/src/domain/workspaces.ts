import { localIdentifier } from './center_routes.ts';
import { deepFreeze, jsonBytesWithin, keys, record } from './value.ts';

export interface Workspace { readonly id: string; readonly name: string; readonly members: readonly string[] }
export interface WorkspaceSelection { readonly workspaces: readonly Workspace[]; readonly selectedWorkspace: string | null }
export const EMPTY_WORKSPACES: WorkspaceSelection = deepFreeze({ workspaces: [], selectedWorkspace: null });
export const workspaceName = (value: unknown): value is string => typeof value === 'string' && value.length >= 1
    && value.length <= 60 && value.trim() === value && !/[\p{Cc}\p{Cf}]/u.test(value);
/** Persist authored grouping and opaque references only; no provider identity or credential is a preference. */
export function validWorkspaceSelection(value: unknown): value is WorkspaceSelection {
    if (!record(value) || !keys(value, ['workspaces', 'selectedWorkspace']) || Object.keys(value).length !== 2
        || !jsonBytesWithin(value, 65536) || !Array.isArray(value.workspaces) || value.workspaces.length > 10
        || Object.keys(value.workspaces).length !== value.workspaces.length) return false;
    const ids = new Set<string>(); const names = new Set<string>();
    for (const entry of value.workspaces) {
        if (!record(entry) || !keys(entry, ['id', 'name', 'members']) || Object.keys(entry).length !== 3
            || !localIdentifier(entry.id) || !workspaceName(entry.name) || ids.has(entry.id) || names.has(entry.name.toLowerCase())
            || !Array.isArray(entry.members) || entry.members.length > 20 || Object.keys(entry.members).length !== entry.members.length
            || !entry.members.every(localIdentifier) || new Set(entry.members).size !== entry.members.length) return false;
        ids.add(entry.id); names.add(entry.name.toLowerCase());
    }
    return value.selectedWorkspace === null || typeof value.selectedWorkspace === 'string' && ids.has(value.selectedWorkspace);
}
export function copyWorkspaceSelection(value: unknown): WorkspaceSelection | null {
    if (!validWorkspaceSelection(value)) return null;
    const detached: unknown = JSON.parse(JSON.stringify(value));
    if (!validWorkspaceSelection(detached)) return null;
    return deepFreeze({ workspaces: detached.workspaces.map(entry => ({ id: entry.id, name: entry.name, members: [...entry.members] })),
        selectedWorkspace: detached.selectedWorkspace });
}

/** Imported slots and the nonunique H2 alias are intentionally inert references. */
export const bindableWorkspaceReference = (id: string): boolean => id !== 'previous-session' && !id.startsWith('unbound-');
export function importedWorkspaces(value: WorkspaceSelection): WorkspaceSelection {
    return deepFreeze({ workspaces: value.workspaces.map((group, groupIndex) => ({ ...group,
        members: group.members.map((_, memberIndex) => `unbound-${groupIndex}-${memberIndex}`) })), selectedWorkspace: value.selectedWorkspace });
}

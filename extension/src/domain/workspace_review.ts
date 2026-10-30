import { copyWorkspaceSelection } from './workspaces.ts';
import { workspaceCopy } from './workspace_copy.ts';
import type { ReviewChange } from './center_review.ts';
import type { ConnectionOutcome } from './named_sessions.ts';
import { deepFreeze, record } from './value.ts';

/** Complete semantic workspace delta, with saved private labels confined to this current admitted view. */
export function workspaceReviewChanges(before: unknown, after: unknown, locale: string, connections?: ConnectionOutcome | null): readonly ReviewChange[] | null {
    const selection = (value: unknown) => record(value) && record(value.center)
        ? copyWorkspaceSelection({ workspaces: value.center.workspaces, selectedWorkspace: value.center.selectedWorkspace }) : null;
    const left = selection(before); const right = selection(after); if (!left || !right) return null;
    const copy = workspaceCopy(locale); const rows: ReviewChange[] = [];
    const add = (id: string, label: string, old: string | number | null, next: string | number | null, absent = copy.absent) => {
        if (old !== next) rows.push({ id: `workspace/${id}`, label, before: old === null ? absent : typeof old === 'number' ? `${copy.position} ${old}` : old, after: next === null ? absent : typeof next === 'number' ? `${copy.position} ${next}` : next });
    };
    for (const id of [...new Set([...left.workspaces, ...right.workspaces].map(group => group.id))]) {
        const old = left.workspaces.find(group => group.id === id); const next = right.workspaces.find(group => group.id === id);
        const name = (next ?? old)!.name; const prefix = `${copy.title} › ${name}`;
        add(`${id}/identifier`, `${prefix} › ${copy.identifier}`, old?.id ?? null, next?.id ?? null);
        add(`${id}/name`, `${prefix} › ${copy.name}`, old?.name ?? null, next?.name ?? null);
        add(`${id}/position`, `${prefix} › ${copy.position}`, old ? left.workspaces.indexOf(old) + 1 : null, next ? right.workspaces.indexOf(next) + 1 : null);
        const references = [...new Set([...(old?.members ?? []), ...(next?.members ?? [])])];
        references.forEach((reference, index) => {
            const entry = connections?.state === 'ready' ? connections.entries.find(entry => entry.id === reference) : undefined;
            const label = entry ? `${copy.saved} · ${entry.name} · ${entry.repository}` : `${copy.missing} ${index + 1}`;
            const position = (members: readonly string[] | undefined) => members?.includes(reference) ? members.indexOf(reference) + 1 : null;
            add(`${id}/member/${reference}`, `${prefix} › ${label}`, position(old?.members), position(next?.members), copy.notMember);
        });
    }
    const selectedName = (value: typeof left) => { const group = value.workspaces.find(group => group.id === value.selectedWorkspace); return group ? `${group.name} · ${group.id}` : null; };
    add('selected', `${copy.title} › ${copy.selection}`, selectedName(left), selectedName(right), copy.none);
    return deepFreeze(rows);
}

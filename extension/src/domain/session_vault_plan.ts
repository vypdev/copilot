import type { ConnectionIntent } from './connection_intent.ts';
import { copyNativeSessionVault, upgradeSessionVault, type NativeSessionVault } from './purpose_session_vault.ts';
import type { PurposeSessionEntry } from './session_vault_entries.ts';

/** Build one successor. Identity verification and native execution remain application responsibilities. */
export function planSessionVault(before: NativeSessionVault, intent: Exclude<ConnectionIntent, { type: 'revoke-all' }>, candidate?: PurposeSessionEntry): NativeSessionVault | null {
    if (before.revision >= Number.MAX_SAFE_INTEGER) return null;
    const revision = before.revision + 1;
    if (intent.type === 'disable-role') {
        return before.schemaVersion === 2 && before.writeSelections[intent.purpose] !== null
            ? copyNativeSessionVault({ ...before, revision, writeSelections: { ...before.writeSelections, [intent.purpose]: null } }) : null;
    }
    if (intent.type === 'remove' || intent.type === 'disconnect') {
        const id = intent.type === 'remove' ? intent.id : before.selected;
        if (intent.type === 'remove' && !before.entries.some(entry => entry.id === id)) return null;
        return copyNativeSessionVault({ ...before, revision, selected: before.selected === id ? null : before.selected,
            ...(before.schemaVersion === 2 ? { writeSelections: {
                'issues-write': before.writeSelections['issues-write'] === id ? null : before.writeSelections['issues-write'],
                'actions-write': before.writeSelections['actions-write'] === id ? null : before.writeSelections['actions-write'] } } : {}),
            entries: before.entries.filter(entry => entry.id !== id) });
    }
    if (!candidate) return null;
    const source = intent.type === 'select' ? before.entries.find(entry => entry.id === intent.id) : null;
    if (intent.type === 'select') {
        if (!source || candidate.role !== source.role || candidate.name !== source.name || candidate.connection.secret !== source.connection.secret
            || candidate.connection.viewerId !== source.connection.viewerId || candidate.connection.repositoryId !== source.connection.repositoryId
            || (source.id !== 'previous-session' ? candidate.id !== source.id : candidate.id === 'previous-session')) return null;
    } else if (candidate.role !== (intent.type === 'connect-role' ? intent.purpose : 'repository-read') || candidate.name !== intent.name
        || candidate.connection.secret !== intent.secret || before.entries.some(entry => entry.id === candidate.id)) return null;
    const role = candidate.role;
    const base = role !== 'repository-read' && before.schemaVersion === 1 ? upgradeSessionVault(before) : before;
    const entries = source ? base.entries.map(entry => entry.id === source.id ? candidate : entry) : [...base.entries, candidate];
    return copyNativeSessionVault({ ...base, revision, entries, selected: role === 'repository-read' ? candidate.id : base.selected,
        ...(base.schemaVersion === 2 ? { writeSelections: intent.type === 'select' && role !== 'repository-read'
            ? { ...base.writeSelections, [role]: candidate.id } : base.writeSelections } : {}) });
}

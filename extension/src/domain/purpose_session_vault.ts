import { validWriteSelections, EMPTY_WRITE_SELECTIONS, type WriteSelections } from './credential_roles.ts';
import { validSessionEntries, type PurposeSessionEntry, type ReadSessionEntry } from './session_vault_entries.ts';
import { sameProtectedSession } from './session.ts';
import { deepFreeze, jsonBytesWithin, keys, natural, record } from './value.ts';

export interface ReadSessionVault {
    readonly schemaVersion: 1; readonly revision: number; readonly selected: string | null; readonly entries: readonly ReadSessionEntry[];
}
export interface PurposeSessionVault {
    readonly schemaVersion: 2; readonly revision: number; readonly selected: string | null;
    readonly writeSelections: WriteSelections; readonly entries: readonly PurposeSessionEntry[];
}
export type NativeSessionVault = ReadSessionVault | PurposeSessionVault;
export function validNativeSessionVault(value: unknown): value is NativeSessionVault {
    if (!record(value) || ![1, 2].includes(value.schemaVersion as number) || !natural(value.revision) || !jsonBytesWithin(value, 16 * 1024)) return false;
    const names = value.schemaVersion === 1 ? ['schemaVersion', 'revision', 'selected', 'entries'] : ['schemaVersion', 'revision', 'selected', 'entries', 'writeSelections'];
    if (!keys(value, names) || Object.keys(value).length !== names.length
        || !validSessionEntries(value.entries, value.schemaVersion === 1 ? ['repository-read'] : undefined)) return false;
    if (!(value.selected === null || typeof value.selected === 'string' && value.entries.some(entry => entry.id === value.selected && entry.role === 'repository-read'))) return false;
    return value.schemaVersion === 1 || validWriteSelections(value.writeSelections, value.entries);
}
/** An explicit mutation may upgrade a known read vault; inspection alone never persists it. */
export function upgradeSessionVault(value: ReadSessionVault): PurposeSessionVault {
    return deepFreeze({ ...value, entries: value.entries.map(entry => ({ ...entry, connection: { ...entry.connection } })),
        schemaVersion: 2, writeSelections: { ...EMPTY_WRITE_SELECTIONS } });
}
export function sameNativeSessionVault(value: unknown, expected: NativeSessionVault): boolean {
    return validNativeSessionVault(value) && value.schemaVersion === expected.schemaVersion && value.revision === expected.revision
        && value.selected === expected.selected && value.entries.length === expected.entries.length
        && (value.schemaVersion === 1 || expected.schemaVersion === 2 && value.writeSelections['issues-write'] === expected.writeSelections['issues-write']
            && value.writeSelections['actions-write'] === expected.writeSelections['actions-write'])
        && value.entries.every((entry, index) => entry.id === expected.entries[index].id && entry.name === expected.entries[index].name
            && entry.host === expected.entries[index].host && entry.role === expected.entries[index].role && sameProtectedSession(entry.connection, expected.entries[index].connection));
}
/** Only a detached, validated native snapshot can be retained by a role mutation. */
export function copyNativeSessionVault(value: unknown): NativeSessionVault | null {
    try {
        if (!validNativeSessionVault(value)) return null;
        const snapshot: unknown = JSON.parse(JSON.stringify(value));
        return validNativeSessionVault(snapshot) ? deepFreeze(snapshot) : null;
    } catch { return null; }
}

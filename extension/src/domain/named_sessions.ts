import { validSessionIdentity } from './session.ts';
import { deepFreeze, keys, natural, record } from './value.ts';
import { localIdentifier } from './center_routes.ts';
import { NAMED_SESSION_LIMIT, sessionName, type PurposeSessionEntry } from './session_vault_entries.ts';
import { validNativeSessionVault, sameNativeSessionVault, type NativeSessionVault } from './purpose_session_vault.ts';
import { sessionPurpose, validWriteSelectionsView, writeSelectionsView, type SessionPurpose, type WritePurpose, type WriteSelectionsView } from './credential_roles.ts';

export { NAMED_SESSION_LIMIT, sessionName, repositoryAddress } from './session_vault_entries.ts';
export { connectionIntent, type ConnectionIntent } from './connection_intent.ts';
export type NamedSession = PurposeSessionEntry;
export type SessionVault = NativeSessionVault;
export interface ConnectionSummary {
    readonly id: string; readonly name: string; readonly host: 'github.com'; readonly role: SessionPurpose;
    readonly viewerId: string; readonly viewerLogin: string; readonly repositoryId: string; readonly repository: string;
    readonly organizationId?: string | null;
}
export interface ConnectionsView {
    readonly state: 'ready'; readonly revision: number; readonly selected: string | null;
    readonly connected: boolean; readonly entries: readonly ConnectionSummary[];
    readonly credentialEpoch?: number;
    readonly optionalWrites?: WriteSelectionsView;
}
export type ConnectionOutcome = ConnectionsView | { readonly state: 'invalid' | 'capacity' | 'conflict' | 'stale' | 'unavailable' | 'denied' | 'unknown' | 'limited' | 'cooldown' | 'budget' };
export function validVault(value: unknown): value is SessionVault { return validNativeSessionVault(value); }
export function connectionsView(vault: SessionVault, connected: boolean, credentialEpoch?: number, verifiedWrites: readonly WritePurpose[] = []): ConnectionsView {
    return deepFreeze({ state: 'ready', revision: vault.revision, selected: vault.selected, connected,
        ...(credentialEpoch === undefined ? {} : { credentialEpoch }),
        ...(vault.schemaVersion === 2 ? { optionalWrites: writeSelectionsView(vault.writeSelections, verifiedWrites) } : {}),
        entries: vault.entries.map(({ connection, ...entry }) => ({ ...entry, viewerId: connection.viewerId, viewerLogin: connection.viewerLogin,
            repositoryId: connection.repositoryId, repository: connection.repository,
            ...(connection.organizationId === undefined ? {} : { organizationId: connection.organizationId }) })) });
}
/** Entire canonical vault, independent of object-key insertion order; entry order remains significant. */
export function sameSessionVault(value: unknown, expected: SessionVault): boolean {
    return sameNativeSessionVault(value, expected);
}
export function decodeConnections(value: unknown): ConnectionOutcome | null {
    if (!record(value)) return null;
    if (value.state !== 'ready') return keys(value, ['state']) && Object.keys(value).length === 1
        && ['invalid', 'capacity', 'conflict', 'stale', 'unavailable', 'denied', 'unknown', 'limited', 'cooldown', 'budget'].includes(value.state as string)
        ? value as unknown as ConnectionOutcome : null;
    const purposeAware = Object.hasOwn(value, 'optionalWrites');
    if (!keys(value, ['state', 'revision', 'selected', 'connected', 'entries', 'credentialEpoch', 'optionalWrites'])
        || Object.keys(value).length !== 5 + Number(Object.hasOwn(value, 'credentialEpoch')) + Number(purposeAware) || !natural(value.revision)
        || Object.hasOwn(value, 'credentialEpoch') && !natural(value.credentialEpoch)
        || typeof value.connected !== 'boolean' || !Array.isArray(value.entries) || value.entries.length > NAMED_SESSION_LIMIT
        || Object.keys(value.entries).length !== value.entries.length) return null;
    const ids = new Set<string>(); const names = new Set<string>();
    for (const entry of value.entries) {
        if (!record(entry) || !keys(entry, ['id', 'name', 'host', 'role', 'viewerId', 'viewerLogin', 'repositoryId', 'repository', 'organizationId'])
            || Object.keys(entry).length !== (Object.hasOwn(entry, 'organizationId') ? 9 : 8)
            || !localIdentifier(entry.id) || !sessionName(entry.name) || entry.host !== 'github.com' || !(purposeAware ? sessionPurpose(entry.role) : entry.role === 'repository-read')
            || entry.id === 'previous-session' && entry.role !== 'repository-read'
            || !validSessionIdentity(entry) || ids.has(entry.id) || names.has(entry.name.toLowerCase())) return null;
        ids.add(entry.id); names.add(entry.name.toLowerCase());
    }
    if (!(value.selected === null || typeof value.selected === 'string' && value.entries.some(entry => entry.id === value.selected && entry.role === 'repository-read'))
        || value.connected && value.selected === null || purposeAware && !validWriteSelectionsView(value.optionalWrites, value.entries)) return null;
    const slots = value.optionalWrites as WriteSelectionsView;
    return deepFreeze({ state: 'ready', revision: value.revision, connected: value.connected, selected: value.selected as string | null,
        ...(Object.hasOwn(value, 'credentialEpoch') ? { credentialEpoch: value.credentialEpoch } : {}),
        ...(purposeAware ? { optionalWrites: { 'issues-write': { ...slots['issues-write'] }, 'actions-write': { ...slots['actions-write'] } } } : {}),
        entries: value.entries.map(entry => ({ ...entry })) }) as ConnectionsView;
}

import { validSession, validSessionIdentity, type ProtectedSession } from './session.ts';
import { deepFreeze, jsonBytesWithin, keys, natural, record } from './value.ts';
import { localIdentifier } from './center_routes.ts';

export const NAMED_SESSION_LIMIT = 5;
export interface NamedSession {
    readonly id: string; readonly name: string; readonly host: 'github.com'; readonly role: 'repository-read';
    readonly connection: ProtectedSession;
}
export interface SessionVault {
    readonly schemaVersion: 1; readonly revision: number; readonly selected: string | null;
    readonly entries: readonly NamedSession[];
}
export interface ConnectionSummary {
    readonly id: string; readonly name: string; readonly host: 'github.com'; readonly role: 'repository-read';
    readonly viewerId: string; readonly viewerLogin: string; readonly repositoryId: string; readonly repository: string;
    readonly organizationId?: string | null;
}
export interface ConnectionsView {
    readonly state: 'ready'; readonly revision: number; readonly selected: string | null;
    readonly connected: boolean; readonly entries: readonly ConnectionSummary[];
}
export type ConnectionIntent = { readonly type: 'connect'; readonly name: string; readonly secret: string; readonly repository: string }
    | { readonly type: 'select' | 'remove'; readonly id: string }
    | { readonly type: 'disconnect' } | { readonly type: 'revoke-all' };
export type ConnectionOutcome = ConnectionsView | { readonly state: 'invalid' | 'capacity' | 'conflict' | 'stale' | 'unavailable' | 'denied' | 'unknown' | 'limited' | 'cooldown' | 'budget' };
export const sessionName = (value: unknown): value is string => typeof value === 'string' && value.trim() === value
    && value.length >= 1 && value.length <= 64 && !/[\p{Cc}\p{Cf}]/u.test(value);
export function connectionIntent(value: unknown): value is ConnectionIntent {
    if (!record(value)) return false;
    if (value.type === 'disconnect' || value.type === 'revoke-all') return keys(value, ['type']) && Object.keys(value).length === 1;
    if (value.type === 'select' || value.type === 'remove') return keys(value, ['type', 'id']) && Object.keys(value).length === 2 && localIdentifier(value.id);
    return value.type === 'connect' && keys(value, ['type', 'name', 'secret', 'repository']) && Object.keys(value).length === 4
        && sessionName(value.name) && typeof value.secret === 'string' && /^[A-Za-z0-9_]{8,255}$(?![\s\S])/u.test(value.secret)
        && typeof value.repository === 'string' && value.repository.length <= 201 && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$(?![\s\S])/u.test(value.repository);
}
export function validVault(value: unknown): value is SessionVault {
    if (!record(value) || !keys(value, ['schemaVersion', 'revision', 'selected', 'entries']) || Object.keys(value).length !== 4
        || value.schemaVersion !== 1 || !natural(value.revision) || !Array.isArray(value.entries) || value.entries.length > NAMED_SESSION_LIMIT
        || Object.keys(value.entries).length !== value.entries.length || !jsonBytesWithin(value, 16 * 1024)) return false;
    const ids = new Set<string>(); const names = new Set<string>();
    for (const entry of value.entries) {
        if (!record(entry) || !keys(entry, ['id', 'name', 'host', 'role', 'connection']) || Object.keys(entry).length !== 5
            || !localIdentifier(entry.id) || !sessionName(entry.name) || entry.host !== 'github.com' || entry.role !== 'repository-read'
            || !validSession(entry.connection) || entry.connection.repository.length > 201 || ids.has(entry.id) || names.has(entry.name.toLowerCase())) return false;
        ids.add(entry.id); names.add(entry.name.toLowerCase());
    }
    return value.selected === null || (typeof value.selected === 'string' && ids.has(value.selected));
}
export function connectionsView(vault: SessionVault, connected: boolean): ConnectionsView {
    return deepFreeze({ state: 'ready', revision: vault.revision, selected: vault.selected, connected,
        entries: vault.entries.map(({ connection, ...entry }) => ({ ...entry, viewerId: connection.viewerId, viewerLogin: connection.viewerLogin,
            repositoryId: connection.repositoryId, repository: connection.repository,
            ...(connection.organizationId === undefined ? {} : { organizationId: connection.organizationId }) })) });
}
export function decodeConnections(value: unknown): ConnectionOutcome | null {
    if (!record(value)) return null;
    if (value.state !== 'ready') return keys(value, ['state']) && Object.keys(value).length === 1
        && ['invalid', 'capacity', 'conflict', 'stale', 'unavailable', 'denied', 'unknown', 'limited', 'cooldown', 'budget'].includes(value.state as string)
        ? value as unknown as ConnectionOutcome : null;
    if (!keys(value, ['state', 'revision', 'selected', 'connected', 'entries']) || Object.keys(value).length !== 5 || !natural(value.revision)
        || typeof value.connected !== 'boolean' || !Array.isArray(value.entries) || value.entries.length > NAMED_SESSION_LIMIT
        || Object.keys(value.entries).length !== value.entries.length) return null;
    const ids = new Set<string>(); const names = new Set<string>();
    for (const entry of value.entries) {
        if (!record(entry) || !keys(entry, ['id', 'name', 'host', 'role', 'viewerId', 'viewerLogin', 'repositoryId', 'repository', 'organizationId'])
            || Object.keys(entry).length !== (Object.hasOwn(entry, 'organizationId') ? 9 : 8)
            || !localIdentifier(entry.id) || !sessionName(entry.name) || entry.host !== 'github.com' || entry.role !== 'repository-read'
            || !validSessionIdentity(entry) || ids.has(entry.id) || names.has(entry.name.toLowerCase())) return null;
        ids.add(entry.id); names.add(entry.name.toLowerCase());
    }
    if (!(value.selected === null || (typeof value.selected === 'string' && ids.has(value.selected))) || (value.connected && value.selected === null)) return null;
    return deepFreeze({ state: 'ready', revision: value.revision, connected: value.connected, selected: value.selected as string | null,
        entries: value.entries.map(entry => ({ ...entry })) }) as ConnectionsView;
}

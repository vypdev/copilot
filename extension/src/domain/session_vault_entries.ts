import { validSession, type ProtectedSession } from './session.ts';
import { localIdentifier } from './center_routes.ts';
import { SESSION_PURPOSES, optionalRoleCredential, type SessionPurpose } from './credential_roles.ts';
import { keys, record } from './value.ts';

export const NAMED_SESSION_LIMIT = 5;
export interface PurposeSessionEntry {
    readonly id: string; readonly name: string; readonly host: 'github.com'; readonly role: SessionPurpose;
    readonly connection: ProtectedSession;
}
export type ReadSessionEntry = PurposeSessionEntry & { readonly role: 'repository-read' };
export const sessionName = (value: unknown): value is string => typeof value === 'string' && value.trim() === value
    && value.length >= 1 && value.length <= 64 && !/[\p{Cc}\p{Cf}]/u.test(value);
export const repositoryAddress = (value: unknown): value is string => typeof value === 'string' && value.length <= 201
    && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$(?![\s\S])/u.test(value)
    && value.split('/').every(part => part !== '.' && part !== '..');

/** One capacity and name namespace across all roles; a token cannot cross purposes. */
export function validSessionEntries(value: unknown, allowed: readonly SessionPurpose[] = SESSION_PURPOSES): value is readonly PurposeSessionEntry[] {
    if (!Array.isArray(value) || value.length > NAMED_SESSION_LIMIT || Object.keys(value).length !== value.length) return false;
    const ids = new Set<string>(); const names = new Set<string>(); const purposes = new Map<string, SessionPurpose>();
    for (const entry of value) {
        if (!record(entry) || !keys(entry, ['id', 'name', 'host', 'role', 'connection']) || Object.keys(entry).length !== 5
            || !localIdentifier(entry.id) || !sessionName(entry.name) || entry.host !== 'github.com' || !allowed.includes(entry.role as SessionPurpose)
            || entry.id === 'previous-session' && entry.role !== 'repository-read'
            || !validSession(entry.connection) || entry.role !== 'repository-read' && !optionalRoleCredential(entry.connection.secret)
            || ids.has(entry.id) || names.has(entry.name.toLowerCase())) return false;
        const previous = purposes.get(entry.connection.secret);
        if (previous !== undefined && previous !== entry.role) return false;
        ids.add(entry.id); names.add(entry.name.toLowerCase()); purposes.set(entry.connection.secret, entry.role as SessionPurpose);
    }
    return true;
}

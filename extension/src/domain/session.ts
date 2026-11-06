import { keys, natural, record } from './value.ts';

export interface SessionIdentity {
    readonly viewerId: string;
    readonly viewerLogin: string;
    readonly repositoryId: string;
    readonly repository: string;
    readonly organizationId?: string | null;
}
export interface ProtectedSession extends SessionIdentity { readonly schemaVersion: 1; readonly secret: string }
export function validSessionIdentity(value: unknown): value is SessionIdentity {
    return record(value) && typeof value.viewerLogin === 'string' && /^[A-Za-z0-9-]{1,39}$(?![\s\S])/u.test(value.viewerLogin)
        && [value.viewerId, value.repositoryId].every(id => typeof id === 'string' && /^[1-9]\d{0,19}$(?![\s\S])/u.test(id))
        && typeof value.repository === 'string' && value.repository.length <= 201 && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$(?![\s\S])/u.test(value.repository)
        && (!Object.hasOwn(value, 'organizationId') || value.organizationId === null
            || typeof value.organizationId === 'string' && /^[1-9]\d{0,19}$(?![\s\S])/u.test(value.organizationId));
}
export function validSession(value: unknown): value is ProtectedSession {
    return record(value) && keys(value, ['schemaVersion', 'secret', 'viewerId', 'viewerLogin', 'repositoryId', 'repository', 'organizationId'])
        && Object.keys(value).length === (Object.hasOwn(value, 'organizationId') ? 7 : 6) && value.schemaVersion === 1 && typeof value.secret === 'string'
        && /^[A-Za-z0-9_]{8,255}$(?![\s\S])/u.test(value.secret) && validSessionIdentity(value);
}
export interface PageFence { readonly generation: number; readonly route: string; readonly repositoryId: string }
/** Equality of the entire closed protected record, independent of property order. */
export function sameProtectedSession(value: unknown, expected: unknown): boolean {
    return validSession(value) && validSession(expected) && Object.keys(value).length === Object.keys(expected).length
        && Object.entries(expected).every(([key, item]) => value[key as keyof ProtectedSession] === item);
}
export function currentFence(previous: PageFence | undefined, next: PageFence): boolean {
    return natural(next.generation) && (!previous || next.generation > previous.generation
        || (next.generation === previous.generation && next.route === previous.route && next.repositoryId === previous.repositoryId));
}

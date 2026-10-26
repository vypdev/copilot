import { keys, natural, record } from './value.ts';

export interface ProtectedSession {
    readonly schemaVersion: 1;
    readonly secret: string;
    readonly viewerId: string;
    readonly viewerLogin: string;
    readonly repositoryId: string;
    readonly repository: string;
}
export function validSession(value: unknown): value is ProtectedSession {
    return record(value) && keys(value, ['schemaVersion', 'secret', 'viewerId', 'viewerLogin', 'repositoryId', 'repository'])
        && Object.keys(value).length === 6 && value.schemaVersion === 1 && typeof value.secret === 'string'
        && /^[A-Za-z0-9_]{8,255}$(?![\s\S])/u.test(value.secret) && typeof value.viewerLogin === 'string'
        && /^[A-Za-z0-9-]{1,39}$(?![\s\S])/u.test(value.viewerLogin)
        && [value.viewerId, value.repositoryId].every(id => typeof id === 'string' && /^[1-9]\d{0,19}$(?![\s\S])/u.test(id))
        && typeof value.repository === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$(?![\s\S])/u.test(value.repository);
}
export interface PageFence { readonly generation: number; readonly route: string; readonly repositoryId: string }
export function currentFence(previous: PageFence | undefined, next: PageFence): boolean {
    return natural(next.generation) && (!previous || next.generation > previous.generation
        || (next.generation === previous.generation && next.route === previous.route && next.repositoryId === previous.repositoryId));
}

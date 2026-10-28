import { keys, natural, record } from './value.ts';

export type ReadRequest = { readonly type: 'viewer' }
    | { readonly type: 'repository'; readonly name: string }
    | { readonly type: 'object'; readonly repository: string; readonly kind: 'issue' | 'pull'; readonly number: number };
export interface Viewer { readonly id: string; readonly login: string }
export interface Repository { readonly id: string; readonly name: string }
export interface NativeObject {
    readonly kind: 'issue' | 'pull'; readonly number: number; readonly title: string;
    readonly state: 'open' | 'closed'; readonly url: string;
}
export function validRead(value: unknown): value is ReadRequest {
    if (!record(value)) return false;
    if (value.type === 'viewer') return keys(value, ['type']) && Object.keys(value).length === 1;
    const name = value.type === 'repository' ? value.name : value.repository;
    if (typeof name !== 'string' || name.length > 201 || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$(?![\s\S])/u.test(name)
        || name.split('/').some(part => part === '.' || part === '..')) return false;
    if (value.type === 'repository') return keys(value, ['type', 'name']) && Object.keys(value).length === 2;
    return value.type === 'object' && keys(value, ['type', 'repository', 'kind', 'number']) && Object.keys(value).length === 4
        && ['issue', 'pull'].includes(value.kind as string) && natural(value.number) && value.number > 0 && value.number <= 9999999999;
}
export function decodeRead(request: ReadRequest, value: unknown): Viewer | Repository | NativeObject | null {
    if (!record(value)) return null;
    if (request.type === 'viewer') return natural(value.id) && value.id > 0 && typeof value.login === 'string'
        && /^[A-Za-z0-9-]{1,39}$(?![\s\S])/u.test(value.login) ? { id: String(value.id), login: value.login } : null;
    if (request.type === 'repository') return natural(value.id) && value.id > 0 && typeof value.full_name === 'string'
        && value.full_name.toLowerCase() === request.name.toLowerCase() ? { id: String(value.id), name: value.full_name } : null;
    const url = `https://github.com/${request.repository}/${request.kind === 'issue' ? 'issues' : 'pull'}/${request.number}`;
    if (value.number !== request.number || value.html_url !== url || typeof value.title !== 'string' || value.title.length > 500
        || !['open', 'closed'].includes(value.state as string) || (request.kind === 'issue' && value.pull_request !== undefined)
        || (request.kind === 'pull' && !record(value.head))) return null;
    return { kind: request.kind, number: request.number, title: value.title, state: value.state as 'open' | 'closed', url };
}

import { isEligibleGitHubUrl } from './eligibility.ts';
import { pageIdentity } from './page.ts';
import { keys, natural, record, utf8Bytes } from './value.ts';

export interface Sender {
    readonly id?: string; readonly url?: string; readonly origin?: string; readonly frameId?: number;
    readonly documentId?: string;
    readonly tab?: { readonly id?: number; readonly url?: string; readonly incognito?: boolean; readonly active?: boolean };
}
export type Message = { readonly method: 'settings.read'; readonly version: 1 }
    | { readonly method: 'session.status'; readonly version: 1 }
    | { readonly method: 'session.disconnect'; readonly version: 1 }
    | { readonly method: 'page.release'; readonly version: 1; readonly generation: number }
    | { readonly method: 'settings.write'; readonly version: 1; readonly settings: unknown; readonly expectedRevision: number }
    | { readonly method: 'session.connect'; readonly version: 1; readonly secret: string; readonly repository: string }
    | { readonly method: 'page.snapshot'; readonly version: 1; readonly route: string; readonly generation: number;
        readonly repositoryId: string; readonly viewer: string | null; readonly visible: boolean; readonly manual: boolean };
const PAGE = new Set(['settings.read', 'session.status', 'page.snapshot', 'page.release']);
export function extensionSender(sender: Sender, id: string, origin: string): boolean {
    return sender.id === id && sender.url === `${origin}runtime.html`
        && (sender.origin === undefined || `${sender.origin}/` === origin)
        && (sender.frameId === undefined || sender.frameId === 0) && sender.tab?.incognito !== true;
}
export function pageSender(sender: Sender, id: string): boolean {
    return sender.id === id && sender.frameId === 0 && sender.tab?.incognito === false
        && natural(sender.tab.id) && sender.tab.id > 0 && typeof sender.url === 'string'
        && sender.tab.url === sender.url && (sender.origin === undefined || sender.origin === 'https://github.com')
        && isEligibleGitHubUrl(sender.url);
}
export function parseMessage(value: unknown): Message | null {
    if (!record(value) || value.version !== 1 || typeof value.method !== 'string') return null;
    if (['settings.read', 'session.status', 'session.disconnect'].includes(value.method)) {
        return keys(value, ['version', 'method']) && Object.keys(value).length === 2 ? value as Message : null;
    }
    if (value.method === 'page.release') return keys(value, ['version', 'method', 'generation'])
        && Object.keys(value).length === 3 && natural(value.generation) ? value as Message : null;
    if (value.method === 'settings.write') return keys(value, ['version', 'method', 'settings', 'expectedRevision'])
        && Object.keys(value).length === 4 && natural(value.expectedRevision) ? value as Message : null;
    if (value.method === 'session.connect') return keys(value, ['version', 'method', 'secret', 'repository'])
        && Object.keys(value).length === 4 && typeof value.secret === 'string' && /^[A-Za-z0-9_]{8,255}$(?![\s\S])/u.test(value.secret)
        && typeof value.repository === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$(?![\s\S])/u.test(value.repository)
        && value.repository.length <= 201 ? value as Message : null;
    if (value.method !== 'page.snapshot' || !keys(value, ['version', 'method', 'route', 'generation', 'repositoryId', 'viewer', 'visible', 'manual'])
        || Object.keys(value).length !== 8 || typeof value.route !== 'string' || utf8Bytes(value.route) > 4096
        || !pageIdentity(value.route) || !natural(value.generation) || typeof value.repositoryId !== 'string'
        || !/^(?:[1-9]\d{0,19})?$(?![\s\S])/u.test(value.repositoryId)
        || !(value.viewer === null || (typeof value.viewer === 'string' && /^[A-Za-z0-9-]{1,39}$(?![\s\S])/u.test(value.viewer)))
        || typeof value.visible !== 'boolean' || typeof value.manual !== 'boolean') return null;
    return value as unknown as Message;
}
export function allowedMessage(message: Message, sender: Sender, id: string, origin: string): boolean {
    if (extensionSender(sender, id, origin)) return message.method !== 'page.snapshot' && message.method !== 'page.release';
    return PAGE.has(message.method) && pageSender(sender, id)
        && (message.method !== 'page.snapshot' || message.route === sender.url);
}

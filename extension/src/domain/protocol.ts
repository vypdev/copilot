import { isEligibleGitHubUrl } from './eligibility.ts';
import { pageIdentity } from './page.ts';
import { parseCenterLocation } from './center_routes.ts';
import { keys, natural, record, utf8Bytes } from './value.ts';
import { CENTER_COMMANDS, type CenterCommand } from './shortcuts.ts';
import { snapshotHelperIntent, type HelperSampleIntent } from './helper_sample.ts';

export interface Sender {
    readonly id?: string; readonly url?: string; readonly origin?: string; readonly frameId?: number;
    readonly documentId?: string;
    readonly tab?: { readonly id?: number; readonly url?: string; readonly incognito?: boolean; readonly active?: boolean };
}
export type Message = { readonly method: 'settings.read'; readonly version: 1 }
    | { readonly method: 'settings.open'; readonly version: 1; readonly command?: CenterCommand; readonly health?: HelperSampleIntent }
    | { readonly method: 'session.status'; readonly version: 1 }
    | { readonly method: 'session.disconnect'; readonly version: 1 }
    | { readonly method: 'page.release'; readonly version: 1; readonly generation: number }
    | { readonly method: 'settings.write'; readonly version: 1; readonly settings: unknown; readonly expectedRevision: number }
    | { readonly method: 'session.connect'; readonly version: 1; readonly secret: string; readonly repository: string }
    | { readonly method: 'page.snapshot'; readonly version: 1; readonly route: string; readonly generation: number;
        readonly repositoryId: string; readonly viewer: string | null; readonly visible: boolean; readonly manual: boolean }
    | { readonly method: 'page.configuration'; readonly version: 1; readonly route: string; readonly generation: number;
        readonly repositoryId: string; readonly viewer: string | null; readonly visible: boolean; readonly manual: false };
const PAGE = new Set(['settings.open', 'session.status', 'page.snapshot', 'page.configuration', 'page.release']);
function extensionLocation(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const match = /^((?:chrome-extension|moz-extension|safari-web-extension):\/\/)([A-Za-z0-9-]{1,128})(\/(?:runtime\.html)?)$(?![\s\S])/u.exec(value);
    // Safari reports sender.origin with a lowercase UUID while getURL keeps uppercase.
    return match ? `${match[1]}${match[2].toLowerCase()}${match[3]}` : null;
}
export function extensionSender(sender: Sender, id: string, origin: string): boolean {
    const root = extensionLocation(origin);
    const parts = typeof sender.url === 'string' ? sender.url.split('#') : [];
    return root !== null && sender.id === id && parts.length <= 2 && extensionLocation(parts[0]) === `${root}runtime.html`
        && (parts.length === 1 || parseCenterLocation(`#${parts[1]}`) !== null)
        && (sender.origin === undefined || extensionLocation(`${sender.origin}/`) === root)
        && (sender.frameId === undefined || sender.frameId === 0) && sender.tab?.incognito !== true;
}
// Same-document navigation can retain the original frame URL; both native URLs must remain eligible.
export function pageSender(sender: Sender, id: string): boolean {
    return sender.id === id && sender.frameId === 0 && sender.tab?.incognito === false
        && natural(sender.tab.id) && sender.tab.id > 0 && typeof sender.url === 'string'
        && typeof sender.tab.url === 'string' && isEligibleGitHubUrl(sender.tab.url) && (sender.origin === undefined || sender.origin === 'https://github.com')
        && isEligibleGitHubUrl(sender.url);
}
export function parseMessage(value: unknown): Message | null {
    if (!record(value) || value.version !== 1 || typeof value.method !== 'string') return null;
    if (value.method === 'settings.open') {
        if (!keys(value, ['version', 'method', 'command', 'health']) || Object.keys(value).length !== 2 + Number(Object.hasOwn(value, 'command')) + Number(Object.hasOwn(value, 'health'))
            || Object.hasOwn(value, 'command') && !(typeof value.command === 'string' && CENTER_COMMANDS.includes(value.command as CenterCommand))) return null;
        const health = Object.hasOwn(value, 'health') ? snapshotHelperIntent(value.health) : undefined;
        if (health === null) return null;
        return { version: 1, method: 'settings.open', ...(Object.hasOwn(value, 'command') ? { command: value.command as CenterCommand } : {}), ...(health ? { health } : {}) };
    }
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
    if (!['page.snapshot', 'page.configuration'].includes(value.method) || (value.method === 'page.configuration' && value.manual !== false)
        || !keys(value, ['version', 'method', 'route', 'generation', 'repositoryId', 'viewer', 'visible', 'manual'])
        || Object.keys(value).length !== 8 || typeof value.route !== 'string' || utf8Bytes(value.route) > 4096
        || !pageIdentity(value.route) || !natural(value.generation) || typeof value.repositoryId !== 'string'
        || !/^(?:[1-9]\d{0,19})?$(?![\s\S])/u.test(value.repositoryId)
        || !(value.viewer === null || (typeof value.viewer === 'string' && /^[A-Za-z0-9-]{1,39}$(?![\s\S])/u.test(value.viewer)))
        || typeof value.visible !== 'boolean' || typeof value.manual !== 'boolean') return null;
    return value as unknown as Message;
}
export function allowedMessage(message: Message, sender: Sender, id: string, origin: string): boolean {
    if (extensionSender(sender, id, origin)) return message.method !== 'page.snapshot' && message.method !== 'page.configuration' && message.method !== 'page.release' && message.method !== 'settings.open';
    return PAGE.has(message.method) && pageSender(sender, id)
        && (!['page.snapshot', 'page.configuration'].includes(message.method) || 'route' in message && message.route === sender.tab?.url);
}

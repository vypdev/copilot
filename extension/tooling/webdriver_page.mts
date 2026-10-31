import { keys, record } from '../src/domain/value.ts';

export type PageCommand = (method: 'GET' | 'POST' | 'DELETE', route: string, body?: unknown) => Promise<unknown>;
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
const controlFree = (value: string): boolean => Array.from(value).every(character => {
    const code = character.codePointAt(0)!; return code >= 32 && code !== 127;
});
// Unicode mode treats a valid surrogate pair as its code point, so only lone surrogates match this range.
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0
    && value.length <= 512 && controlFree(value) && !/[\uD800-\uDFFF]/u.test(value);
const input = (value: unknown, limit: number): value is string => typeof value === 'string'
    && value.length <= limit && !value.includes('\0');
function reference(value: unknown): string {
    if (!record(value) || !keys(value, [ELEMENT]) || Object.keys(value).length !== 1 || !identifier(value[ELEMENT])) {
        throw new Error('webdriver:page:invalid-element');
    }
    return encodeURIComponent(value[ELEMENT]);
}
/** Public W3C interactions inside the driver's owned session; never injects page events. */
export class NativePage {
    private readonly command: PageCommand;
    constructor(command: PageCommand) { this.command = command; }
    private async find(selector: string): Promise<string> {
        if (!input(selector, 1000) || !selector.trim() || !controlFree(selector)) {
            throw new Error('webdriver:page:invalid-selector');
        }
        return reference(await this.command('POST', '/element', { using: 'css selector', value: selector }));
    }
    async click(selector: string): Promise<void> {
        const element = await this.find(selector); await this.command('POST', `/element/${element}/click`, {});
    }
    async fill(selector: string, value: string): Promise<void> {
        if (!input(value, 4096)) throw new Error('webdriver:page:invalid-input');
        const element = await this.find(selector); await this.command('POST', `/element/${element}/clear`, {});
        await this.command('POST', `/element/${element}/value`, { text: value });
    }
    async keys(selector: string, value: string): Promise<void> {
        if (!input(value, 4096) || !value.length) throw new Error('webdriver:page:invalid-keys');
        const element = await this.find(selector); await this.command('POST', `/element/${element}/value`, { text: value });
    }
    async select(selector: string, value: string): Promise<void> {
        if (!input(value, 128) || !controlFree(value)) throw new Error('webdriver:page:invalid-option');
        const element = await this.find(selector);
        if (await this.command('GET', `/element/${element}/name`) !== 'select') throw new Error('webdriver:page:not-select');
        const escaped = value.replace(/[\\"]/gu, '\\$&');
        const option = reference(await this.command('POST', `/element/${element}/element`, {
            using: 'css selector', value: `option[value="${escaped}"]`,
        }));
        await this.command('POST', `/element/${option}/click`, {});
    }
    async windows(): Promise<readonly string[]> {
        const handles = await this.command('GET', '/window/handles');
        if (!Array.isArray(handles) || !handles.length || handles.length > 16
            || !handles.every(identifier) || new Set(handles).size !== handles.length) throw new Error('webdriver:page:invalid-windows');
        return Object.freeze([...handles]);
    }
    async activate(handle: string): Promise<void> {
        if (!identifier(handle) || !(await this.windows()).includes(handle)) throw new Error('webdriver:page:unknown-window');
        await this.command('POST', '/window', { handle });
    }
    async newView(): Promise<Readonly<{ handle: string; type: 'tab' | 'window' }>> {
        const view = await this.command('POST', '/window/new', { type: 'tab' });
        if (!record(view) || !keys(view, ['handle', 'type']) || Object.keys(view).length !== 2
            || !identifier(view.handle) || !['tab', 'window'].includes(view.type as string)) throw new Error('webdriver:page:invalid-new-window');
        return Object.freeze({ handle: view.handle, type: view.type as 'tab' | 'window' });
    }
    async closeView(): Promise<void> {
        if ((await this.windows()).length < 2) throw new Error('webdriver:page:last-window');
        await this.command('DELETE', '/window');
    }
    async resize(width: number, height: number): Promise<void> {
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 320 || width > 3840 || height < 240 || height > 2160) {
            throw new Error('webdriver:page:invalid-rectangle');
        }
        // This requests an outer window rectangle; acceptance must measure the actual CSS viewport separately.
        await this.command('POST', '/window/rect', { width, height });
    }
    async screenshot(): Promise<Buffer> {
        // Transport validation only; rendered-image inspection remains separate evidence.
        const value = await this.command('GET', '/screenshot');
        if (typeof value !== 'string' || !value.length || value.length > 12 * 1024 * 1024
            || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$(?![\s\S])/u.test(value)) throw new Error('webdriver:page:invalid-screenshot');
        const bytes = Buffer.from(value, 'base64');
        if (bytes.length > 8 * 1024 * 1024 || bytes.toString('base64') !== value
            || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('webdriver:page:invalid-png');
        return bytes;
    }
}

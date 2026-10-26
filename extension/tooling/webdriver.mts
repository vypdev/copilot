import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';

export interface BrowserDriver {
    readonly capabilities: Record<string, unknown>;
    navigate(url: string): Promise<void>;
    focusFixture(): Promise<void>;
    openRuntimeOptions(): Promise<string>;
    evaluate<T>(script: string, args?: unknown[]): Promise<T>;
    evaluateAsync<T>(script: string, args?: unknown[]): Promise<T>;
    close(): Promise<void>;
}
export interface DriverConfiguration { readonly target: 'chrome' | 'firefox' | 'firefox-esr' | 'safari'; readonly binary: string; readonly driver: string; readonly artifact: string }
export async function freePort(): Promise<number> {
    const server = createServer();
    return new Promise((resolve, reject) => {
        server.once('error', reject); server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as { port: number }).port;
            server.close(error => error ? reject(error) : resolve(port));
        });
    });
}
export function pauseDriver(milliseconds: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
export class NativeDriver implements BrowserDriver {
    private session = '';
    private installed = '';
    private cleanupWindow = '';
    private child: ChildProcess | undefined;
    private temporary = '';
    private endpoint = '';
    capabilities: Record<string, unknown> = {};
    private readonly configuration: DriverConfiguration;
    private readonly pause: (milliseconds: number) => Promise<void>;
    constructor(configuration: DriverConfiguration, pause = pauseDriver) { this.configuration = configuration; this.pause = pause; }
    private async command<T>(method: string, route: string, body?: unknown): Promise<T> {
        let response: Response;
        try { response = await fetch(`${this.endpoint}${route}`, { method, signal: AbortSignal.timeout(45000),
            headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
        catch { throw new Error(`webdriver:${route.replace(this.session, 'session')}:transport-unavailable`); }
        const data = await response.json() as { value: T & { error?: string } };
        if (!response.ok || data.value?.error) throw new Error(`webdriver:${route.replace(this.session, 'session')}:${response.status}:${data.value?.error ?? 'request-failed'}`);
        return data.value;
    }
    async start(): Promise<void> {
        const port = await freePort(); this.endpoint = `http://127.0.0.1:${port}`;
        this.temporary = await mkdtemp(path.join(tmpdir(), 'copilot-h2-browser-'));
        const safari = this.configuration.target === 'safari';
        this.child = spawn(this.configuration.driver, safari ? ['-p', String(port)] : this.configuration.target === 'chrome' ? [`--port=${port}`] : ['--port', String(port), '--allow-system-access', '--profile-root', this.temporary], { stdio: 'ignore' });
        this.child.on('error', () => undefined);
        try {
            let ready = false;
            for (let attempt = 0; attempt < 100; attempt++) {
                if (this.child.exitCode !== null) break;
                try { await this.command('GET', '/status'); ready = true; break; } catch { await this.pause(50); }
            }
            if (!ready) throw new Error('prerequisite:webdriver-unavailable');
            const firefox = this.configuration.target.startsWith('firefox');
            const alwaysMatch: Record<string, unknown> = { browserName: safari ? 'safari' : firefox ? 'firefox' : 'chrome' };
            if (firefox) alwaysMatch['moz:firefoxOptions'] = { binary: this.configuration.binary, args: ['-headless'], prefs: {
                'extensions.webextensions.uuids': JSON.stringify({ 'copilot-foundation-dev@extensions.invalid': '00000000-0000-4000-8000-000000000703' }),
            } };
            else if (!safari) alwaysMatch['goog:chromeOptions'] = { binary: this.configuration.binary, enableExtensionTargets: true,
                args: ['--headless=new', '--no-first-run', '--no-default-browser-check',
                    `--user-data-dir=${path.join(this.temporary, 'profile')}`, `--load-extension=${this.configuration.artifact}`,
                    `--disable-extensions-except=${this.configuration.artifact}`] };
            const session = await this.command<{ sessionId: string; capabilities: Record<string, unknown> }>('POST', '/session', { capabilities: { alwaysMatch } });
            this.session = session.sessionId; this.capabilities = session.capabilities;
            await this.command('POST', `/session/${this.session}/timeouts`, { script: 15000, pageLoad: 30000, implicit: 0 });
            if (safari) {
                const result = await this.command<unknown>('POST', `/session/${this.session}/webextension`, { type: 'path', path: this.configuration.artifact });
                const installed = typeof result === 'string' ? result : result && typeof result === 'object' && Object.keys(result).length === 1
                    && 'extension' in result ? result.extension : undefined;
                if (typeof installed !== 'string' || !installed || installed.length > 256) throw new Error('prerequisite:safari-extension-installation');
                this.installed = installed;
                // Both owned views use the configured controller; cleanup never unloads its active page.
                const cleanup = await this.command<{ handle: string }>('POST', `/session/${this.session}/window/new`, { type: 'tab' });
                this.cleanupWindow = cleanup.handle;
                const window = await this.command<{ handle: string }>('POST', `/session/${this.session}/window/new`, { type: 'tab' });
                await this.command('POST', `/session/${this.session}/window`, { handle: window.handle });
            }
            if (firefox) await this.command('POST', `/session/${this.session}/moz/addon/install`, { path: this.configuration.artifact, temporary: true });
        } catch (error) { await this.close(); throw error; }
    }
    async navigate(url: string): Promise<void> {
        try { await this.command('POST', `/session/${this.session}/url`, { url }); }
        catch (error) { throw new Error(`${(error as Error).message}:${url.startsWith('https://github.com/') ? 'public-bootstrap' : 'packaged-options'}`, { cause: error }); }
    }
    async focusFixture(): Promise<void> {
        // Only the independently authored fixture heading is clicked, never live GitHub controls.
        const route = `/session/${this.session}`;
        const reference = await this.command<Record<string, string>>('POST', `${route}/element`,
            { using: 'css selector', value: 'main > h1' });
        await this.command('POST', `${route}/element/${encodeURIComponent(reference['element-6066-11e4-a52e-4f735466cecf'])}/click`, {});
    }
    async openRuntimeOptions(): Promise<string> {
        const route = `/session/${this.session}`;
        const before = await this.command<string[]>('GET', `${route}/window/handles`);
        const reference = await this.command<Record<string, unknown>>('POST', `${route}/element`,
            { using: 'css selector', value: '[data-copilot-open-settings]' });
        const element = reference['element-6066-11e4-a52e-4f735466cecf'];
        if (typeof element !== 'string' || !element || element.length > 512) throw new Error('assertion:runtime-options-element');
        let transitionFailure: unknown;
        try { await this.command('POST', `${route}/element/${encodeURIComponent(element)}/click`, {}); }
        catch (error) {
            // Safari may replace the source context while opening the extension page.
            if (this.configuration.target !== 'safari' || !String(error).endsWith(':404:no such window')) throw error;
            transitionFailure = error;
        }
        let context = '';
        for (let attempt = 0; attempt < 150; attempt++) {
            const after = await this.command<string[]>('GET', `${route}/window/handles`);
            const added = after.filter(handle => !before.includes(handle));
            if (added.length > 1) throw new Error('assertion:runtime-options-context-ambiguous');
            if (added.length === 1) { context = added[0]; break; }
            await this.pause(100);
        }
        if (!context) throw transitionFailure ?? new Error('assertion:runtime-options-context-missing');
        await this.command('POST', `${route}/window`, { handle: context });
        for (let attempt = 0; attempt < 150; attempt++) {
            const url = await this.command<string>('GET', `${route}/url`);
            if (url && url !== 'about:blank' && await this.evaluate('return document.readyState;') === 'complete') return url;
            await this.pause(100);
        }
        throw new Error('assertion:runtime-options-load-incomplete');
    }
    evaluate<T>(script: string, args: unknown[] = []): Promise<T> { return this.command('POST', `/session/${this.session}/execute/sync`, { script, args }); }
    evaluateAsync<T>(script: string, args: unknown[] = []): Promise<T> { return this.command('POST', `/session/${this.session}/execute/async`, { script, args }); }
    async close(): Promise<void> {
        try {
            try { if (this.installed) {
                // Uninstall from the owned blank view, not the extension view being unloaded.
                await this.command('POST', `/session/${this.session}/window`, { handle: this.cleanupWindow });
                await this.command('DELETE', `/session/${this.session}/webextension/${encodeURIComponent(decodeURIComponent(this.installed))}`);
            } }
            finally { if (this.session) await this.command('DELETE', `/session/${this.session}`); }
        }
        finally {
            this.session = ''; this.installed = ''; this.cleanupWindow = ''; this.child?.kill(); this.child = undefined;
            if (this.temporary) { await rm(this.temporary, { recursive: true, force: true }); this.temporary = ''; }
        }
    }
}

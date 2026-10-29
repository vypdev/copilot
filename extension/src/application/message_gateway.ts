import { allowedMessage, extensionSender, parseMessage, type Message, type Sender } from '../domain/protocol.ts';
import { parseCenterMessage } from '../domain/center_protocol.ts';
import { currentFence, type PageFence } from '../domain/session.ts';
import { natural } from '../domain/value.ts';
import type { CancellationOwner } from './read_ports.ts';
import { ProtectedSessionService } from './protected_session.ts';
import { SettingsRepository } from './settings_repository.ts';
import type { CenterGateway } from './center_gateway.ts';
import { sameSettingsContent } from '../domain/settings_operation.ts';
import { record } from '../domain/value.ts';
import type { NamedSessions } from './named_sessions.ts';
import { PageConfigurationService } from './page_configuration.ts';
import type { CenterCommand } from '../domain/shortcuts.ts';

interface PageLease { readonly fence: PageFence; readonly cancel: CancellationOwner }
export interface GatewayPorts {
    currentTab(id: number): Promise<{ readonly url?: string; readonly active?: boolean; readonly incognito?: boolean; readonly windowId?: number }>;
    openSettings(windowId: number, command?: CenterCommand): Promise<unknown>;
    cancellation(): CancellationOwner;
    online(): boolean;
    notify(): void;
}
export class MessageGateway {
    private readonly pages = new Map<number, PageLease>();
    private readonly openings = new Map<number, object>();
    private stopped = false;
    private connectionOperation = 0;
    constructor(private readonly id: string, private readonly origin: string, private readonly settings: SettingsRepository,
        private readonly sessions: ProtectedSessionService, private readonly ports: GatewayPorts, private readonly center?: CenterGateway,
        private readonly connections?: NamedSessions) {}
    releaseCenterTab(id: number): void { this.center?.releaseTab(id); }
    shutdown(): void { if (this.stopped) return; this.stopped = true; this.invalidate(); this.center?.shutdown(); }
    invalidate(tabId?: number, notify = true): void {
        if (tabId !== undefined) {
            this.pages.get(tabId)?.cancel.abort(); this.pages.delete(tabId); this.openings.delete(tabId); return;
        }
        for (const lease of this.pages.values()) lease.cancel.abort();
        this.pages.clear(); this.openings.clear(); if (notify) this.ports.notify();
    }
    private async open(message: Extract<Message, { method: 'settings.open' }>, sender: Sender): Promise<unknown> {
        const id = sender.tab!.id!;
        if (this.openings.has(id) || this.openings.size >= 128) return { state: 'busy' };
        const ticket = {}; this.openings.set(id, ticket);
        try {
            const current = await this.ports.currentTab(id);
            if (this.openings.get(id) !== ticket) return { state: 'stale' };
            if (current.url !== sender.tab?.url || current.incognito !== false || current.active !== true || !natural(current.windowId)) return { state: 'rejected' };
            if (message.command === undefined) await this.ports.openSettings(current.windowId);
            else await this.ports.openSettings(current.windowId, message.command);
            return { state: 'opened' };
        } finally { if (this.openings.get(id) === ticket) this.openings.delete(id); }
    }
    private async connect(message: Extract<Message, { method: 'session.connect' }>): Promise<unknown> {
        const operation = ++this.connectionOperation;
        this.invalidate();
        const status = await this.sessions.connect(message.secret, message.repository);
        const epoch = status.epoch;
        const current = () => operation === this.connectionOperation && epoch === this.sessions.status().epoch;
        if (!current()) return { state: 'stale' };
        try {
            if (status.state === 'connected') {
                const id = this.sessions.selectedRepositoryId();
                await this.settings.update(settings => ({ ...settings, repositories: { ...settings.repositories,
                    [id]: { ...settings.repositories[id], connected: true } } }), current);
            }
            if (!current()) return { state: 'stale' };
            this.ports.notify(); return this.sessions.status();
        } catch {
            if (!current()) return { state: 'stale' };
            await this.sessions.revoke(); return { state: 'unavailable' };
        }
    }
    async handle(value: unknown, sender: Sender): Promise<unknown> {
        if (this.stopped) return { state: 'rejected' };
        const center = parseCenterMessage(value);
        if (center) return extensionSender(sender, this.id, this.origin) && this.center
            ? this.center.handle(center, sender) : { state: 'rejected' };
        const message = parseMessage(value);
        if (!message || !allowedMessage(message, sender, this.id, this.origin)) return { state: 'rejected' };
        // Retained H2 tabs cannot bypass H3's review, controller or named-selection authority.
        if (this.center && (message.method === 'settings.write' || message.method === 'session.connect')) return { state: 'rejected' };
        try {
            if (message.method === 'settings.read') return await this.settings.initialize();
            if (message.method === 'settings.write') {
                const settings = await this.settings.update(current => {
                    // The legacy H2 editor cannot bypass retained H3 previews for center changes.
                    if (current.revision !== message.expectedRevision || !record(message.settings)
                        || !sameSettingsContent({ ...current, center: message.settings.center }, current)) throw new Error('settings-conflict-or-invalid');
                    return message.settings;
                });
                this.invalidate(); return { state: 'ready', settings };
            }
            if (message.method === 'session.disconnect') {
                this.connectionOperation++; this.invalidate();
                if (this.connections) await this.connections.revokeAll(); else await this.sessions.revoke();
                return this.sessions.status();
            }
            if (message.method === 'session.connect') return await this.connect(message);
            if (message.method === 'session.status') {
                // Legacy page status cannot start restoration outside the page/profile admission path.
                if (extensionSender(sender, this.id, this.origin)) await this.sessions.start();
                return this.sessions.status();
            }
            const id = sender.tab!.id!;
            if (message.method === 'page.release') {
                if (this.pages.get(id)?.fence.generation === message.generation) this.invalidate(id);
                return { state: 'released' };
            }
            if (message.method === 'settings.open') return await this.open(message, sender);
            const current = await this.ports.currentTab(id);
            if (current.incognito !== false || current.url !== message.route) return { state: 'rejected' };
            const fence = { generation: message.generation, route: message.route, repositoryId: message.repositoryId };
            const previous = this.pages.get(id);
            if (!currentFence(previous?.fence, fence)) return { state: 'rejected' };
            let lease = previous;
            if (!lease || lease.fence.generation !== fence.generation) {
                previous?.cancel.abort();
                if (!previous && this.pages.size >= 128) return { state: 'busy' };
                lease = { fence, cancel: this.ports.cancellation() }; this.pages.set(id, lease);
            }
            const online = this.ports.online();
            const currentPage = () => !lease.cancel.aborted && this.pages.get(id) === lease && (!online || this.ports.online());
            const configuration = await new PageConfigurationService(this.settings, this.sessions)
                .resolve(message, lease.cancel, currentPage, current.active === true, online);
            if (!currentPage()) return { state: 'stale' };
            if (!configuration) return { state: message.method === 'page.snapshot' ? 'paused' : 'unavailable' };
            const epoch = this.sessions.status().epoch;
            const result = message.method === 'page.configuration' ? configuration
                : !configuration.connected ? { state: 'paused' }
                    : await this.sessions.snapshot(message, current.active === true, this.ports.online(), lease.cancel);
            const final = await this.ports.currentTab(id);
            if (epoch !== this.sessions.status().epoch || lease.cancel.aborted || this.pages.get(id) !== lease || final.url !== message.route || final.incognito !== false || final.active !== true) return { state: 'stale' };
            return result;
        } catch {
            // Provider exceptions/raw payloads/credentials never cross this boundary.
            return { state: 'unavailable' };
        }
    }
}

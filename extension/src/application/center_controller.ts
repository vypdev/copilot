import { settingsOperationId } from '../domain/settings_operation.ts';
import { natural } from '../domain/value.ts';
import type { Sender } from '../domain/protocol.ts';
import type { SettingsOwnerFence } from './settings_transaction_ports.ts';

export interface CenterBinding { readonly documentId: string | null; readonly tabId: number | null }
export interface CenterClient extends SettingsOwnerFence { readonly state: 'ready'; readonly clientId: string; readonly role: 'editor' | 'observer' }
export interface CenterControllerPorts {
    now(): number; identifier(): string; permitted(): boolean; credentialEpoch(): number; changed(): void;
}
interface Client { readonly binding: CenterBinding; touchedAt: number }
const IDLE_TTL = 30 * 60_000;

export function centerBinding(sender: Sender): CenterBinding | null {
    if (sender.documentId !== undefined && (typeof sender.documentId !== 'string' || sender.documentId.length < 1 || sender.documentId.length > 128)) return null;
    if (sender.tab?.id !== undefined && !natural(sender.tab.id)) return null;
    return { documentId: sender.documentId ?? null, tabId: sender.tab?.id ?? null };
}
const sameBinding = (a: CenterBinding, b: CenterBinding) => a.documentId === b.documentId && a.tabId === b.tabId;

/** Worker-local editing ownership is separate from persisted settings and credentials. */
export class CenterController {
    private readonly clients = new Map<string, Client>();
    private editor: string | null = null;
    private epoch = 0;
    constructor(private readonly ports: CenterControllerPorts) {}
    private bump(): boolean {
        this.editor = null;
        const available = this.epoch < Number.MAX_SAFE_INTEGER;
        if (available) this.epoch++; else this.clients.clear();
        try { this.ports.changed(); } catch { /* Ownership is already fenced even if notification failed. */ }
        return available;
    }
    private time(): number | null {
        try {
            const now = this.ports.now();
            if (!this.ports.permitted() || !natural(now) || !natural(now + IDLE_TTL) || !natural(this.ports.credentialEpoch())) {
                if (this.clients.size) { this.clients.clear(); this.bump(); }
                return null;
            }
            for (const [id, client] of this.clients) if (now < client.touchedAt || now >= client.touchedAt + IDLE_TTL) {
                this.clients.delete(id); if (this.editor === id) this.bump();
            }
            return now;
        } catch { this.clients.clear(); this.editor = null; return null; }
    }
    private view(id: string): CenterClient {
        return { state: 'ready', clientId: id, role: this.editor === id ? 'editor' : 'observer',
            controllerEpoch: this.epoch, credentialEpoch: this.ports.credentialEpoch() };
    }
    open(binding: CenterBinding): CenterClient | { readonly state: 'unavailable' | 'busy' } {
        const now = this.time();
        if (now === null) return { state: 'unavailable' };
        // A tab ID alone survives reloads: it must never revive another document's client.
        if (binding.documentId !== null) for (const [id, client] of this.clients) if (sameBinding(client.binding, binding)) {
            client.touchedAt = now; return this.view(id);
        }
        if (this.clients.size >= 8) return { state: 'busy' };
        let id: string;
        try { id = this.ports.identifier(); } catch { return { state: 'unavailable' }; }
        if (!settingsOperationId(id) || this.clients.has(id)) return { state: 'unavailable' };
        if (this.editor === null) { if (!this.bump()) return { state: 'unavailable' }; this.editor = id; }
        this.clients.set(id, { binding: { ...binding }, touchedAt: now });
        return this.view(id);
    }
    authorize(id: string, binding: CenterBinding, expectedEpoch?: number): CenterClient | null {
        const now = this.time(); const client = this.clients.get(id);
        if (now === null || !client || !sameBinding(client.binding, binding) || (expectedEpoch !== undefined && expectedEpoch !== this.epoch)) return null;
        client.touchedAt = now; return this.view(id);
    }
    claim(id: string, binding: CenterBinding, expectedEpoch: number): CenterClient | { readonly state: 'stale' | 'unavailable' } {
        const client = this.authorize(id, binding, expectedEpoch);
        if (!client) return { state: 'stale' };
        if (client.role === 'editor') return client;
        if (!this.bump()) return { state: 'unavailable' };
        this.editor = id; return this.view(id);
    }
    close(id: string, binding: CenterBinding, expectedEpoch: number): { readonly state: 'closed' | 'stale' } {
        if (!this.authorize(id, binding, expectedEpoch)) return { state: 'stale' };
        this.clients.delete(id); if (this.editor === id) this.bump();
        return { state: 'closed' };
    }
    releaseTab(tabId: number): void {
        for (const [id, client] of this.clients) if (client.binding.tabId === tabId) {
            this.clients.delete(id); if (this.editor === id) this.bump();
        }
    }
    fence(id: string): SettingsOwnerFence | null {
        if (this.time() === null || this.editor !== id || !this.clients.has(id)) return null;
        return { controllerEpoch: this.epoch, credentialEpoch: this.ports.credentialEpoch() };
    }
    shutdown(): void { this.clients.clear(); this.bump(); }
}

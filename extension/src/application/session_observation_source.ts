import { natural } from '../domain/value.ts';
import type { SettingsOwnerFence } from './settings_transaction_ports.ts';

/** A private observation witness, never reusable authority or an IPC field. Queries do not touch idle leases. */
export class SessionObservationSource {
    private expected: SettingsOwnerFence | null;
    constructor(private readonly query: () => SettingsOwnerFence | null) { this.expected = this.read(); }
    private read(): SettingsOwnerFence | null {
        try { const value = this.query(); return value && natural(value.controllerEpoch) && natural(value.credentialEpoch) ? { ...value } : null; }
        catch { return null; }
    }
    current(): boolean {
        if (!this.expected) return false;
        const value = this.read();
        if (!value || !this.expected || value.controllerEpoch !== this.expected.controllerEpoch || value.credentialEpoch !== this.expected.credentialEpoch) this.expected = null;
        return this.expected !== null;
    }
    advance(previous: number, next: number): void {
        if (!this.expected) return;
        const value = this.read();
        if (!this.expected || !natural(previous) || !natural(next) || next !== previous + 1 || previous !== this.expected.credentialEpoch
            || !value || value.controllerEpoch !== this.expected.controllerEpoch || value.credentialEpoch !== next) this.expected = null;
        else this.expected = { ...value };
    }
    retire(): void { this.expected = null; }
}

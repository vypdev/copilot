import type { Settings, SettingsLoad } from '../domain/settings.ts';
import type { SettingsAction, SettingsChangePlan } from '../domain/settings_change.ts';

export interface SettingsReceipt { readonly id: string; readonly beforeRevision: number }
export interface SettingsInspection {
    readonly loaded: SettingsLoad;
    readonly rollback: Settings | null;
    readonly operation: SettingsReceipt | null;
}
export type SettingsCommit = { readonly state: 'committed'; readonly revision: number;
    readonly acknowledgement: 'accepted' | 'unknown'; readonly current: boolean }
    | { readonly state: 'replayed'; readonly revision: number }
    | { readonly state: 'conflict' | 'invalid' | 'stale' | 'unavailable' }
    | { readonly state: 'unknown'; readonly observedRevision: number | null;
        readonly acknowledgement: 'accepted' | 'unknown';
        readonly observation: 'unchanged' | 'changed' | 'unavailable' };
export interface SettingsOwnerFence { readonly controllerEpoch: number; readonly credentialEpoch: number }
export interface SettingsOperationPorts {
    now(): number;
    identifier(): string;
    fence(owner: string): SettingsOwnerFence | null;
    notify(): void;
}
export type SettingsPreview = { readonly state: 'preview'; readonly operationId: string; readonly revision: number;
    readonly expiresAt: number; readonly action: SettingsAction; readonly before: Settings; readonly after: Settings }
    | Extract<SettingsChangePlan, { state: 'invalid' | 'unchanged' }>
    | { readonly state: 'denied' | 'stale' | 'unavailable' | 'future' | 'corrupt' | 'busy' | 'migration-required' };
export type SettingsOperationOutcome = SettingsCommit | { readonly state: 'expired' | 'cancelled' | 'pending' | 'denied' };

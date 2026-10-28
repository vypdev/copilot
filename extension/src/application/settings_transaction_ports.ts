import type { Settings, SettingsLoad } from '../domain/settings.ts';
import type { SettingsReceipt, SettingsOwnerFence } from '../domain/settings_result.ts';
export type { SettingsReceipt, SettingsOwnerFence, SettingsCommit, SettingsPreview, SettingsOperationOutcome } from '../domain/settings_result.ts';
export interface SettingsInspection {
    readonly loaded: SettingsLoad;
    readonly rollback: Settings | null;
    readonly operation: SettingsReceipt | null;
}
export interface SettingsOperationPorts {
    now(): number;
    identifier(): string;
    fence(owner: string): SettingsOwnerFence | null;
    notify(): void;
}

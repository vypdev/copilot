import type { SettingsAction } from '../domain/settings_change.ts';
import type { SettingsCommit } from '../domain/settings_result.ts';
import type { CurrentTarget } from '../domain/current_operation.ts';

export interface SettingsOperationTrace {
    confirming(): void; submitted(): void; cancelled(): void; blocked(): void; complete(outcome: SettingsCommit): void;
}
export type ObserveSettingsOperation = (owner: string, action: SettingsAction, target: CurrentTarget, current: () => boolean) => SettingsOperationTrace | null;
/** Secondary synchronous observations never replace a primary result. */
export function reportSettings(trace: SettingsOperationTrace | null, event: Exclude<keyof SettingsOperationTrace, 'complete'>): void {
    try { trace?.[event](); } catch { /* Observation is independent from the primary operation. */ }
}
export function completeSettings(trace: SettingsOperationTrace | null, outcome: SettingsCommit): void {
    try { trace?.complete(Object.freeze({ ...outcome })); } catch { /* Canonical primary facts survive observer failure. */ }
}

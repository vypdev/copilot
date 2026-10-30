import type { Settings } from '../domain/settings.ts';
import type { ObserveCollectionPolicy } from './collection_policy_observation_ports.ts';

export interface SettingsWritePreparation { readonly allowed: boolean; release(): void }
/** Restriction-only preparation. This port cannot grant collection, connection or write authority. */
export interface SettingsWriteEffects {
    prepare(before: Settings, after: Settings, current: () => boolean, operationId?: string, observe?: ObserveCollectionPolicy): Promise<SettingsWritePreparation>;
}

/** A failed secondary restriction must not prevent saving off, but cannot admit an opt-in increase. */
export async function settingsWriteScope(effects: SettingsWriteEffects | undefined, before: Settings, after: Settings,
    current: () => boolean, operationId?: string, observe?: ObserveCollectionPolicy): Promise<SettingsWritePreparation> {
    let prepared: SettingsWritePreparation | undefined;
    let allowed = true;
    if (effects) {
        try { prepared = await (observe ? effects.prepare(before, after, current, operationId, observe)
            : effects.prepare(before, after, current, operationId)); allowed = prepared.allowed === true; }
        catch { allowed = !(['diagnostics', 'recents'] as const).some(kind => !before.center[kind] && after.center[kind]); }
    }
    let released = false;
    return Object.freeze({ allowed, release() {
        if (released) return;
        released = true;
        try { prepared?.release(); } catch { /* Secondary cleanup cannot erase a primary settings fact. */ }
    } });
}

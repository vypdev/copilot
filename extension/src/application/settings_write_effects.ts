import type { Settings } from '../domain/settings.ts';

export interface SettingsWritePreparation { readonly allowed: boolean; release(): void }
/** Restriction-only preparation. This port cannot grant collection, connection or write authority. */
export interface SettingsWriteEffects {
    prepare(before: Settings, after: Settings, current: () => boolean): Promise<SettingsWritePreparation>;
}

/** A failed secondary restriction must not prevent saving off, but cannot admit an opt-in increase. */
export async function settingsWriteScope(effects: SettingsWriteEffects | undefined, before: Settings, after: Settings,
    current: () => boolean): Promise<SettingsWritePreparation> {
    let prepared: SettingsWritePreparation | undefined;
    let allowed = true;
    if (effects) {
        try { prepared = await effects.prepare(before, after, current); allowed = prepared.allowed === true; }
        catch { allowed = !(['diagnostics', 'recents'] as const).some(kind => !before.center[kind] && after.center[kind]); }
    }
    let released = false;
    return Object.freeze({ allowed, release() {
        if (released) return;
        released = true;
        try { prepared?.release(); } catch { /* Secondary cleanup cannot erase a primary settings fact. */ }
    } });
}

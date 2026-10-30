import type { SettingsOwnerFence } from '../domain/settings_result.ts';
/** Native source stays background-only. Public previews contain the numeric scope and a bounded display label. */
export interface NativePauseTarget { readonly tabId: number; readonly source: string; readonly label: string | null }
export interface PauseReviewPorts {
    now(): number;
    identifier(): string;
    fence(owner: string): SettingsOwnerFence | null;
    target(tabId: number): Promise<NativePauseTarget | null>;
}

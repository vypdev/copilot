import type { SettingsOwnerFence } from '../domain/settings_result.ts';
import type { SessionPreferenceReviewSource } from './session_preference_sources.ts';
import type { SettingsMutationReservation } from './settings_mutation_queue.ts';

export interface SessionPreferenceReviewPorts {
    now(): number; identifier(): string; fence(owner: string): SettingsOwnerFence | null;
    captureSource(): () => boolean; readSource(current: () => boolean): Promise<SessionPreferenceReviewSource | null>;
    reserveSettings(): SettingsMutationReservation | null;
}

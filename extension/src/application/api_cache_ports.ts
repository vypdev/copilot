import type { ApiCacheFactState } from '../domain/api_cache.ts';
import type { SettingsOwnerFence } from '../domain/settings_result.ts';

/** Worker-local response memory only. Does not expose a cache key, body or scheduling state. */
export interface ApiCachePort {
    capture(): Readonly<object>;
    current(witness: Readonly<object>): boolean;
    clear(witness: Readonly<object>, current: () => boolean): boolean;
}
export interface ApiCacheReviewPorts {
    now(): number;
    identifier(): string;
    fence(owner: string): SettingsOwnerFence | null;
    observe?(owner: string, current: () => boolean): ((state: ApiCacheFactState) => void) | null;
}

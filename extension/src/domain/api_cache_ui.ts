import { deepFreeze } from './value.ts';
import type { ApiCacheReply } from './api_cache.ts';

export interface ApiCacheView {
    readonly phase: 'idle' | 'reviewing' | 'confirming' | 'cancelling' | 'reading';
    readonly status: ApiCacheReply['state'] | null;
    readonly open: boolean;
    readonly retained: boolean;
}
export const EMPTY_API_CACHE_VIEW: ApiCacheView = deepFreeze({ phase: 'idle', status: null, open: false, retained: false });
/** No operation selector or reusable authority reaches presentation. */
export interface ApiCacheActions { preview(): void; confirm(): void; cancel(): void; inspect(): void; dismiss(): void }

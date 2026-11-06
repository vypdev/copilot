import { decodeHistoryValue, exactHistoryFields as exact } from './history_decode.ts';
import type { JournalRetention } from './history_state.ts';
import { helperId, helperSnapshot, latestHelperReasons, type HelperId, type HelperSnapshot } from './helper_sample.ts';
import { natural } from './value.ts';

export interface HelperRetained { readonly helper: HelperId; readonly retention: JournalRetention }
export type HelperSampleReply = { readonly state: 'empty' | 'unavailable' }
    | { readonly state: 'sample'; readonly capturedAt: number; readonly health: HelperSnapshot; readonly retention: readonly HelperRetained[] };
export interface HelperSampleView { readonly phase: 'idle' | 'reading' | 'ready' | 'unavailable'; readonly value: HelperSampleReply | null }
export const EMPTY_HELPER_SAMPLE: HelperSampleView = Object.freeze({ phase: 'idle', value: null });
function reply(value: unknown): value is HelperSampleReply {
    if (exact(value, ['state'])) return value.state === 'empty' || value.state === 'unavailable';
    if (!exact(value, ['state', 'capturedAt', 'health', 'retention']) || value.state !== 'sample' || !natural(value.capturedAt)
        || !helperSnapshot(value.health) || !Array.isArray(value.retention) || value.retention.length > 2) return false;
    const helpers = latestHelperReasons(value.health).map(reason => reason.featureId);
    return value.retention.length === helpers.length && value.retention.every((entry, index) => exact(entry, ['helper', 'retention'])
        && helperId(entry.helper) && entry.helper === helpers[index]
        && ['pending', 'stored', 'not-retained', 'unknown', 'untracked'].includes(entry.retention as string));
}
export function decodeHelperSample(value: unknown): HelperSampleReply | null { return decodeHistoryValue(value, reply); }

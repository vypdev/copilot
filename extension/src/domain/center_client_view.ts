import type { Settings } from './settings.ts';
import type { CenterPlan } from './center_reply.ts';
import type { ReviewState } from './center_review.ts';
import type { SettingsOperationOutcome, SettingsReceipt } from './settings_result.ts';

export interface CenterData {
    readonly state: 'ready' | 'future' | 'corrupt' | 'migration-required'; readonly settings: Settings | null;
    readonly role: 'editor' | 'observer'; readonly rollbackAvailable: boolean; readonly lastOperation: SettingsReceipt | null;
}
export type ClientReview = Omit<CenterPlan, 'state' | 'operationId'> & { readonly state: ReviewState; readonly outcome?: SettingsOperationOutcome };
export interface CenterClientView {
    readonly phase: 'loading' | 'reading' | 'ready' | 'previewing' | 'committing' | 'stopped';
    readonly data: CenterData | null; readonly review: ClientReview | null;
    readonly issue: 'unavailable' | 'incompatible' | 'stale' | 'denied' | 'busy' | 'invalid' | 'unchanged' | 'conflict' | 'expired' | null;
}

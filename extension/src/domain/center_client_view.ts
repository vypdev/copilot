import type { Settings } from './settings.ts';
import type { CenterPlan } from './center_reply.ts';
import type { ReviewState } from './center_review.ts';
import type { SettingsOperationOutcome, SettingsReceipt } from './settings_result.ts';
import type { ConnectionOutcome } from './named_sessions.ts';

export interface CenterData {
    readonly state: 'ready' | 'future' | 'corrupt' | 'migration-required'; readonly settings: Settings | null;
    readonly role: 'editor' | 'observer'; readonly rollbackAvailable: boolean; readonly lastOperation: SettingsReceipt | null;
}
export type ClientReview = Omit<CenterPlan, 'state' | 'operationId'> & { readonly state: ReviewState; readonly outcome?: SettingsOperationOutcome };
export interface CenterClientView {
    readonly role?: 'editor' | 'observer' | null;
    readonly connections?: ConnectionOutcome | null;
    readonly phase: 'loading' | 'reading' | 'ready' | 'claiming' | 'previewing' | 'committing' | 'stopped';
    readonly data: CenterData | null; readonly review: ClientReview | null;
    readonly issue: 'unavailable' | 'incompatible' | 'stale' | 'denied' | 'busy' | 'invalid' | 'unchanged' | 'conflict' | 'expired' | null;
}
/** Opening, disposal or a failed current observation cannot promote retained preferences to current facts. */
export function currentCenterSettings(view: CenterClientView): Settings | null {
    return view.phase !== 'loading' && view.phase !== 'stopped' && view.data?.state === 'ready'
        && (view.issue === null || view.issue === 'invalid' || view.issue === 'unchanged') ? view.data.settings : null;
}

import type { JournalAction, OperationFact } from './journal_facts.ts';
import type { HistoryIssue } from './history_client_view.ts';

export const HISTORY_TEXT_KEYS = ['diagnostics', 'recents', 'diagnosticIntro', 'recentIntro', 'read', 'enable', 'stop', 'clear', 'export',
    'idle', 'reading', 'unavailable', 'stale', 'off', 'on', 'unknown', 'globallyPaused', 'temporary', 'activationPending',
    'preference', 'policy', 'admission', 'scope', 'scopeValue', 'gap', 'pending', 'details', 'epoch', 'revision', 'dropped',
    'empty', 'firstObserved', 'timeUnavailable', 'intent', 'acknowledgement', 'observation', 'helper', 'activeHelper', 'retiredHelper',
    'review', 'before', 'after', 'confirm', 'cancel', 'close', 'inspect', 'submitting', 'cancelling', 'uncertain', 'historical',
    'notSubmitted', 'phasePreference', 'phasePolicy', 'verified', 'unverified', 'clearScope', 'entries', 'clearControls',
    'exportTitle', 'exportScope', 'download', 'recovery', 'guide', 'active', 'paused', 'sourceCurrent', 'downloadFailed', 'stepResult', 'reason',
    'visitsUnconfirmed', 'visitsPending', 'visitsUnconfirmedCount', 'visitsScope'] as const;
export interface HistoryCopy {
    readonly text: Readonly<Record<typeof HISTORY_TEXT_KEYS[number], string>>;
    readonly actions: Readonly<Record<JournalAction, string>>;
    readonly phases: Readonly<Record<OperationFact['phase'], string>>;
    readonly acknowledgements: Readonly<Record<OperationFact['acknowledgement'], string>>;
    readonly observations: Readonly<Record<OperationFact['observation'], string>>;
    readonly issues: Readonly<Record<HistoryIssue, string>>;
    readonly steps: Readonly<Record<'committed' | 'replayed' | 'conflict' | 'invalid' | 'stale' | 'unavailable' | 'unknown' | 'already' | 'not-attempted', string>>;
    readonly policyAcks: Readonly<Record<'not-attempted' | 'not-applied' | 'accepted' | 'unknown', string>>;
    readonly reasons: Readonly<Record<'done' | 'busy' | 'stale' | 'preference-unconfirmed' | 'policy-unconfirmed' | 'changed' | 'unavailable' | 'not-started' | 'aborted', string>>;
}

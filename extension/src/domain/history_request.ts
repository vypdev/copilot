import type { HistoryMessage } from './history_protocol.ts';

type ReviewedHistoryMessage = Exclude<HistoryMessage, { readonly method: 'center.recents.capture' | 'center.recents.observe' }>;
type Intent<T> = T extends ReviewedHistoryMessage ? Omit<T, 'version' | 'clientId' | 'controllerEpoch' | 'credentialEpoch'> : never;
/** The mounted application supplies a logical use case; reusable native client authority stays in CenterClient. */
export type HistoryRequest = Intent<ReviewedHistoryMessage>;

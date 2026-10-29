import type { HistoryMessage } from './history_protocol.ts';

type Intent<T> = T extends HistoryMessage ? Omit<T, 'version' | 'clientId' | 'controllerEpoch' | 'credentialEpoch'> : never;
/** The mounted application supplies a logical use case; reusable native client authority stays in CenterClient. */
export type HistoryRequest = Intent<HistoryMessage>;

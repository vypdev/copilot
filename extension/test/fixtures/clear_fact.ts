import { initialClearFact, type ClearFact } from '../../src/domain/clear_fact.ts';
export const clearRunning = (): ClearFact => ({ ...initialClearFact('diagnostics'), state: 'running' });
export const clearSubmitted = (): ClearFact => ({ ...clearRunning(), submitted: true, acknowledgement: 'unknown' });
export const clearSettled = (): ClearFact => ({ ...clearSubmitted(), state: 'settled', result: 'observed-cleared', acknowledgement: 'accepted', observation: 'cleared', sourceCurrentAtObservation: true });

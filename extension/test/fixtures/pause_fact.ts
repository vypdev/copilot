import { initialPauseFact, type PauseFact } from '../../src/domain/pause_fact.ts';
export const pauseReviewed = () => initialPauseFact('pause-emergency');
export const pauseRunning = (): PauseFact => ({ ...pauseReviewed(), state: 'running' });
export const pauseSubmitted = (): PauseFact => ({ ...pauseRunning(), submitted: true, acknowledgement: 'unknown' });
export const pauseSettled = (): PauseFact => ({ ...pauseSubmitted(), state: 'settled', result: 'committed', acknowledgement: 'accepted', observation: 'committed', sourceCurrentAtObservation: true });
export const pauseAdopted = (): PauseFact => ({ ...initialPauseFact('adopt-pauses'), state: 'settled', result: 'reconciled', observation: 'adopted', sourceCurrentAtObservation: true });

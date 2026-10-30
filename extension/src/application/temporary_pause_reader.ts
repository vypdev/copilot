import { loadTemporaryPauses, type TemporaryPauseLoad } from '../domain/temporary_pauses.ts';
import type { StoragePort } from './runtime_ports.ts';
import type { TemporaryPauseCondition, TemporaryPauseObservation } from '../domain/temporary_pause_observation.ts';
import { deepFreeze } from '../domain/value.ts';

export const TEMPORARY_PAUSES_KEY = 'copilot.temporary-pauses.v1';
/** Read-only admission prerequisite. No permission request, initialization write, cache or fallback store. */
export class TemporaryPauseReader {
    constructor(private readonly storage: StoragePort, private readonly protectedArea: () => Promise<boolean>,
        private readonly restricted: () => boolean | TemporaryPauseCondition = () => false) {}
    get condition(): TemporaryPauseCondition {
        try {
            const value = this.restricted();
            return value === false || value === 'clear' ? 'clear'
                : value === 'pending' || value === 'precaution' || value === 'pending-precaution' ? value : 'unavailable';
        } catch { return 'unavailable'; }
    }
    private unavailable(condition: TemporaryPauseCondition): TemporaryPauseObservation {
        return deepFreeze({ condition, loaded: { state: 'unavailable' } });
    }
    async observe(): Promise<TemporaryPauseObservation> {
        const initial = this.condition;
        if (initial !== 'clear') return this.unavailable(initial);
        try {
            if (!await this.protectedArea()) return this.unavailable(this.condition);
            const authorized = this.condition;
            if (authorized !== 'clear') return this.unavailable(authorized);
            const loaded = loadTemporaryPauses(await this.storage.get(TEMPORARY_PAUSES_KEY));
            const observed = this.condition;
            return observed === 'clear' ? deepFreeze({ condition: observed, loaded }) : this.unavailable(observed);
        } catch { return this.unavailable(this.condition); }
    }
    async read(): Promise<TemporaryPauseLoad> { return (await this.observe()).loaded; }
}

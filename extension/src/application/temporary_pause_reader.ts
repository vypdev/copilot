import { loadTemporaryPauses, type TemporaryPauseLoad } from '../domain/temporary_pauses.ts';
import type { StoragePort } from './runtime_ports.ts';

export const TEMPORARY_PAUSES_KEY = 'copilot.temporary-pauses.v1';
/** Read-only admission prerequisite. No permission request, initialization write, cache or fallback store. */
export class TemporaryPauseReader {
    constructor(private readonly storage: StoragePort, private readonly protectedArea: () => Promise<boolean>, private readonly restricted: () => boolean = () => false) {}
    async read(): Promise<TemporaryPauseLoad> {
        try {
            if (this.restricted()) return { state: 'unavailable' };
            if (!await this.protectedArea()) return { state: 'unavailable' };
            const loaded = loadTemporaryPauses(await this.storage.get(TEMPORARY_PAUSES_KEY));
            return this.restricted() ? { state: 'unavailable' } : loaded;
        } catch { return { state: 'unavailable' }; }
    }
}

import { loadTemporaryPauses, type TemporaryPauseLoad } from '../domain/temporary_pauses.ts';
import type { StoragePort } from './runtime_ports.ts';

export const TEMPORARY_PAUSES_KEY = 'copilot.temporary-pauses.v1';
/** Read-only admission prerequisite. No permission request, initialization write, cache or fallback store. */
export class TemporaryPauseReader {
    constructor(private readonly storage: StoragePort, private readonly protectedArea: () => Promise<boolean>) {}
    async read(): Promise<TemporaryPauseLoad> {
        try {
            if (!await this.protectedArea()) return { state: 'unavailable' };
            return loadTemporaryPauses(await this.storage.get(TEMPORARY_PAUSES_KEY));
        } catch { return { state: 'unavailable' }; }
    }
}

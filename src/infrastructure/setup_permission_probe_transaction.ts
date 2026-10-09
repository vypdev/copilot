import type { ResourceProbeContext } from './setup_permission_probe_context';
import { ProbeCollision, ProbeFailure } from './setup_permission_probe_http';
import type { ProbeJournalHandle } from './setup_permission_probe_journal';

/** Journal before the first mutation and retain the record until cleanup is proved. */
export async function withProbeCleanup(
    context: ResourceProbeContext,
    name: string,
    operation: (owned: () => void, handle: ProbeJournalHandle) => Promise<void>,
): Promise<void> {
    const handle = await context.journal.begin({ owner: context.owner, repository: context.repository,
        scope: context.scope, probe: context.probe, name });
    let operationError: unknown;
    let created = false;
    try { await operation(() => { created = true; }, handle); }
    catch (error) { operationError = error; }
    if (!created && operationError instanceof ProbeCollision) {
        await handle.markSecretCollision();
        throw operationError;
    }
    if (!created && operationError instanceof ProbeFailure && operationError.httpStatus !== undefined
            && operationError.httpStatus >= 400 && operationError.httpStatus < 500) {
        await handle.dismiss();
        throw operationError;
    }
    context.phase('deleting');
    try { await handle.cleanup(context.http); }
    catch (error) {
        if (error instanceof ProbeFailure && error.cleanupPending) throw error;
        throw new ProbeFailure(`Temporary ${context.probe} cleanup could not be confirmed; recovery is required before retrying.`,
            undefined, true);
    }
    if (operationError) throw operationError;
}

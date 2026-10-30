export interface ProtectedMutationFact {
    readonly acknowledgement: 'accepted' | 'unknown';
    readonly observation: 'committed' | 'different' | 'unavailable';
}
/** Execute once and inspect once, inside the caller's protected persistence reservation. */
export async function protectedMutation(write: () => Promise<void>, inspect: () => Promise<unknown>): Promise<ProtectedMutationFact> {
    let acknowledgement: ProtectedMutationFact['acknowledgement'] = 'accepted';
    try { await write(); } catch { acknowledgement = 'unknown'; }
    let observation: ProtectedMutationFact['observation'] = 'unavailable';
    try { const value = await inspect(); if (value === true) observation = 'committed'; else if (value === false) observation = 'different'; }
    catch { /* An unavailable observation cannot establish the desired protected state. */ }
    return Object.freeze({ acknowledgement, observation });
}

export interface ProtectedMutationFact {
    readonly acknowledgement: 'accepted' | 'unknown';
    readonly observation: 'committed' | 'different' | 'unavailable';
}
export interface ProtectedMutationTrace { submitted(): void; settled(fact: ProtectedMutationFact): void }
/** Execute once and inspect once, inside the caller's protected persistence reservation. */
export async function protectedMutation(write: () => Promise<void>, inspect: () => Promise<unknown>, trace?: ProtectedMutationTrace | null): Promise<ProtectedMutationFact> {
    let acknowledgement: ProtectedMutationFact['acknowledgement'] = 'accepted';
    let attempt: Promise<void> | undefined;
    try { attempt = write(); } catch { acknowledgement = 'unknown'; }
    try { trace?.submitted(); } catch { /* A secondary callback cannot suppress the native observation. */ }
    try { await attempt; } catch { acknowledgement = 'unknown'; }
    let observation: ProtectedMutationFact['observation'] = 'unavailable';
    try { const value = await inspect(); if (value === true) observation = 'committed'; else if (value === false) observation = 'different'; }
    catch { /* An unavailable observation cannot establish the desired protected state. */ }
    const fact = Object.freeze({ acknowledgement, observation });
    try { trace?.settled(fact); } catch { /* A secondary callback cannot rewrite primary persistence facts. */ }
    return fact;
}

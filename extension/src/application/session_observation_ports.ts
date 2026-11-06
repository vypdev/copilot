import type { SessionAction, SessionEffect, SessionResult } from '../domain/session_fact.ts';
import type { CurrentTarget } from '../domain/current_operation.ts';
import type { ProtectedMutationTrace } from './protected_mutation.ts';

export interface SessionMutationTrace {
    step(effect: SessionEffect): ProtectedMutationTrace | null;
    credential(previous: number, next: number): void;
}
export interface SessionOperationTrace extends SessionMutationTrace {
    complete(result: SessionResult): void;
}
export type ObserveSessionOperation = (action: SessionAction, target: CurrentTarget, current: () => boolean) => SessionOperationTrace | null;
export function sessionStep(trace: Pick<SessionMutationTrace, 'step'> | null | undefined, effect: SessionEffect): ProtectedMutationTrace | null {
    try { return trace?.step(effect) ?? null; } catch { return null; }
}
export function sessionCredential(trace: Pick<SessionMutationTrace, 'credential'> | null | undefined, previous: number, next: number): void {
    try { trace?.credential(previous, next); } catch { /* The primary session has already changed its own epoch. */ }
}
export function finishSession(trace: SessionOperationTrace | null, result: SessionResult): void {
    try { trace?.complete(result); } catch { /* Observations cannot change the primary outcome. */ }
}

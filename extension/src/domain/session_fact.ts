import { deepFreeze, keys, record } from './value.ts';

export const SESSION_ACTIONS = ['connect', 'select', 'disconnect', 'remove', 'revoke-all'] as const;
export type SessionAction = typeof SESSION_ACTIONS[number];
export const SESSION_EFFECTS = ['retire-active', 'save-active', 'cleanup-active', 'save-repository-preference', 'save-vault', 'remove-vault'] as const;
export type SessionEffect = typeof SESSION_EFFECTS[number];
export const SESSION_RESULTS = ['ready', 'invalid', 'capacity', 'conflict', 'stale', 'unavailable', 'denied', 'unknown', 'limited', 'cooldown', 'budget'] as const;
export type SessionResult = typeof SESSION_RESULTS[number];
export interface SessionEffectFact {
    readonly ordinal: number; readonly effect: SessionEffect; readonly state: 'submitted' | 'settled';
    readonly acknowledgement: 'accepted' | 'unknown'; readonly observation: 'not-observed' | 'committed' | 'different' | 'unavailable';
}
export interface SessionFact {
    readonly kind: 'session-operation'; readonly action: SessionAction; readonly state: 'running' | 'settled';
    readonly result: 'pending' | SessionResult; readonly effects: readonly SessionEffectFact[]; readonly incomplete: boolean;
}
export const sessionAction = (value: unknown): value is SessionAction => SESSION_ACTIONS.includes(value as SessionAction);
export function sessionEffectAllowed(action: SessionAction, effect: SessionEffect): boolean {
    return effect === 'remove-vault' ? action === 'revoke-all' : effect === 'save-vault' ? action !== 'revoke-all'
        : effect === 'save-active' || effect === 'save-repository-preference' ? action === 'connect' || action === 'select' : effect === 'cleanup-active' ? action !== 'revoke-all' : effect === 'retire-active';
}
function fields(value: unknown, names: string[]): value is Record<string, unknown> { return record(value) && keys(value, names) && Object.keys(value).length === names.length; }
export function sessionEffectFact(value: unknown): value is SessionEffectFact {
    return fields(value, ['ordinal', 'effect', 'state', 'acknowledgement', 'observation']) && Number.isInteger(value.ordinal)
        && (value.ordinal as number) >= 1 && (value.ordinal as number) <= 16 && SESSION_EFFECTS.includes(value.effect as SessionEffect)
        && (value.state === 'submitted' ? value.acknowledgement === 'unknown' && value.observation === 'not-observed'
            : value.state === 'settled' && ['accepted', 'unknown'].includes(value.acknowledgement as string)
                && ['committed', 'different', 'unavailable'].includes(value.observation as string));
}
export function validSessionFact(value: unknown): value is SessionFact {
    if (!fields(value, ['kind', 'action', 'state', 'result', 'effects', 'incomplete']) || value.kind !== 'session-operation'
        || !sessionAction(value.action) || typeof value.incomplete !== 'boolean'
        || !Array.isArray(value.effects) || value.effects.length > 16 || Object.keys(value.effects).length !== value.effects.length
        || !(value.state === 'running' ? value.result === 'pending' : value.state === 'settled' && SESSION_RESULTS.includes(value.result as SessionResult))) return false;
    return value.effects.every((effect, index) => sessionEffectFact(effect) && effect.ordinal === index + 1 && sessionEffectAllowed(value.action as SessionAction, effect.effect))
        && (value.state !== 'settled' || value.incomplete || value.effects.every(effect => effect.state === 'settled'));
}
export function sameSessionEffect(a: SessionEffectFact, b: SessionEffectFact): boolean {
    return a.ordinal === b.ordinal && a.effect === b.effect && a.state === b.state && a.acknowledgement === b.acknowledgement && a.observation === b.observation;
}
export function sameSessionFact(a: SessionFact, b: SessionFact): boolean {
    return a.action === b.action && a.state === b.state && a.result === b.result && a.incomplete === b.incomplete
        && a.effects.length === b.effects.length && a.effects.every((effect, i) => sameSessionEffect(effect, b.effects[i]));
}
/** Same ordered operation only; settled effects and terminal results cannot be rewritten. */
export function sessionFactTransition(before: SessionFact, after: SessionFact): boolean {
    return before.action === after.action && (sameSessionFact(before, after) || before.state === 'running'
        && (!before.incomplete || after.incomplete) && after.effects.length >= before.effects.length
        && before.effects.every((effect, i) => effect.state === 'settled' ? sameSessionEffect(effect, after.effects[i])
            : effect.effect === after.effects[i].effect && effect.ordinal === after.effects[i].ordinal));
}
export function mergeSessionFact(before: SessionFact, after: SessionFact): SessionFact | null {
    if (!validSessionFact(before) || !validSessionFact(after) || !sessionFactTransition(before, after)) return null;
    return sameSessionFact(before, after) ? before : deepFreeze({ ...after, effects: after.effects.map(effect => ({ ...effect })) });
}
export function deepFreezeSessionFact(value: SessionFact): SessionFact {
    const copy = { ...value, effects: value.effects.map(effect => ({ ...effect })) };
    if (!validSessionFact(copy)) throw new Error('invalid-session-observation');
    return deepFreeze(copy);
}

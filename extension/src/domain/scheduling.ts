import { keys, natural, record } from './value.ts';

export interface ScheduleState {
    readonly started: number;
    readonly count: number;
    readonly anonymous: number;
    readonly repositories: Readonly<Record<string, number>>;
    readonly targets: Readonly<Record<string, number>>;
    readonly blockedUntil: number;
    readonly failures: number;
}
export function initialSchedule(now: number): ScheduleState {
    return { started: now, count: 0, anonymous: 0, repositories: {}, targets: {}, blockedUntil: 0, failures: 0 };
}
export function validSchedule(value: unknown): value is ScheduleState {
    return record(value) && keys(value, ['started', 'count', 'anonymous', 'repositories', 'targets', 'blockedUntil', 'failures'])
        && Object.keys(value).length === 7 && ['started', 'count', 'anonymous', 'blockedUntil', 'failures'].every(key => natural(value[key]))
        && record(value.repositories) && Object.keys(value.repositories).length <= 100
        && Object.values(value.repositories).every(natural) && record(value.targets) && Object.keys(value.targets).length <= 128
        && Object.values(value.targets).every(natural);
}
export interface Activity { readonly visible: boolean; readonly active: boolean; readonly online: boolean; readonly pending: boolean; readonly manual: boolean }
export function scheduleDecision(state: ScheduleState, now: number, target: string, repository: string, authenticated: boolean,
    activity: Activity): 'allowed' | 'inactive' | 'cooldown' | 'budget' {
    if (!activity.visible || !activity.active || !activity.online || (!activity.manual && (!activity.pending || !authenticated))) return 'inactive';
    if (state.blockedUntil > now || (state.targets[target] ?? 0) > now) return 'cooldown';
    if (state.count >= 600 || (authenticated ? (state.repositories[repository] ?? 0) >= 120 : state.anonymous >= 30)
        || (!Object.hasOwn(state.repositories, repository) && Object.keys(state.repositories).length >= 100)
        || (!Object.hasOwn(state.targets, target) && Object.keys(state.targets).length >= 128)) return 'budget';
    return 'allowed';
}
export function reserveRead(state: ScheduleState, now: number, target: string, repository: string, authenticated: boolean, manual: boolean): ScheduleState {
    return { ...state, count: state.count + 1, anonymous: state.anonymous + (authenticated ? 0 : 1),
        repositories: { ...state.repositories, [repository]: (state.repositories[repository] ?? 0) + 1 },
        targets: { ...state.targets, [target]: now + (manual ? 10000 : 60000) } };
}
export function rateLimit(state: ScheduleState, now: number, retryAfterSeconds: number, jitterMs: number): ScheduleState {
    const failures = Math.min(3, state.failures + 1);
    const delay = [60000, 120000, 300000][failures - 1];
    const provider = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? Math.min(retryAfterSeconds, 86400) * 1000 : 0;
    return { ...state, failures, blockedUntil: now + Math.max(delay, provider) + Math.max(0, Math.min(1000, jitterMs)) };
}

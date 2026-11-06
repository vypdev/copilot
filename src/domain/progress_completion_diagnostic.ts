/** Closed facts about a rejected model response, never execution or approval evidence. */
export type ProgressCompletionDiagnostic = Readonly<{
    readonly reportedProgress: number;
    readonly requirementCount: number;
    readonly supportedCount: number;
    readonly missingCount: number;
    readonly unknownCount: number;
}>;
const KEYS = ['reportedProgress', 'requirementCount', 'supportedCount', 'missingCount', 'unknownCount'].sort();

export function normalizeProgressCompletionDiagnostic(value: unknown): ProgressCompletionDiagnostic {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Invalid closed progress completion diagnostic.');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== KEYS.length || keys.some(key => typeof key !== 'string' || !KEYS.includes(key))) {
        throw new TypeError('Invalid closed progress completion diagnostic.');
    }
    const { reportedProgress, requirementCount, supportedCount, missingCount, unknownCount } = value as Record<string, unknown>;
    const count = (input: unknown): input is number => typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 && input <= 32;
    if (typeof reportedProgress !== 'number' || !Number.isFinite(reportedProgress) || reportedProgress < 0 || reportedProgress > 100
        || !count(requirementCount) || requirementCount < 1 || !count(supportedCount) || !count(missingCount) || !count(unknownCount)
        || supportedCount + missingCount + unknownCount !== requirementCount
        || (reportedProgress === 100) === (missingCount + unknownCount === 0)) {
        throw new TypeError('Invalid progress completion percentage or counts.');
    }
    return Object.freeze({ reportedProgress, requirementCount, supportedCount, missingCount, unknownCount });
}

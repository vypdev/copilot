export const IMPLEMENTATION_PLAN_MIN_STEPS = 3;
export const IMPLEMENTATION_PLAN_MAX_STEPS = 8;
export const IMPLEMENTATION_PLAN_MAX_DETAILS = 2;
export const IMPLEMENTATION_PLAN_TITLE_MAX_LENGTH = 200;
export const IMPLEMENTATION_PLAN_DETAIL_MAX_LENGTH = 300;
export const IMPLEMENTATION_PLAN_ACCEPTANCE_MAX_LENGTH = 800;

export interface ImplementationPlanStep {
    readonly title: string;
    readonly details: readonly string[];
}

export interface ImplementationPlan {
    readonly steps: readonly ImplementationPlanStep[];
    readonly acceptance: string;
}

/** Restores only the bounded, renderer-owned implementation-plan contract. */
export function parseImplementationPlan(value: unknown): ImplementationPlan | undefined {
    if (!isRecord(value)
        || !hasOnlyKeys(value, ['steps', 'acceptance'])
        || !Array.isArray(value.steps)
        || value.steps.length < IMPLEMENTATION_PLAN_MIN_STEPS
        || value.steps.length > IMPLEMENTATION_PLAN_MAX_STEPS) return undefined;
    const steps = value.steps.map(parseStep);
    if (steps.some(step => step === undefined)) return undefined;
    const acceptance = boundedSingleLine(value.acceptance, IMPLEMENTATION_PLAN_ACCEPTANCE_MAX_LENGTH);
    if (!acceptance) return undefined;
    return Object.freeze({
        steps: Object.freeze(steps as ImplementationPlanStep[]),
        acceptance,
    });
}

/** Stable semantic input for fingerprints; independent from localized UI chrome. */
export function implementationPlanFingerprintInput(plan: ImplementationPlan): string {
    return JSON.stringify({
        steps: plan.steps.map(step => ({ title: step.title, details: [...step.details] })),
        acceptance: plan.acceptance,
    });
}

function parseStep(value: unknown): ImplementationPlanStep | undefined {
    if (!isRecord(value) || !hasOnlyKeys(value, ['title', 'details'])) return undefined;
    const title = boundedSingleLine(value.title, IMPLEMENTATION_PLAN_TITLE_MAX_LENGTH);
    if (!title || !Array.isArray(value.details) || value.details.length > IMPLEMENTATION_PLAN_MAX_DETAILS) {
        return undefined;
    }
    const details = value.details.map(detail => boundedSingleLine(detail, IMPLEMENTATION_PLAN_DETAIL_MAX_LENGTH));
    if (details.some(detail => detail === undefined)) return undefined;
    return Object.freeze({ title, details: Object.freeze(details as string[]) });
}

function boundedSingleLine(value: unknown, maximum: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return normalized && normalized.length <= maximum && !/[\r\n]/u.test(normalized)
        ? normalized
        : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    return Object.keys(value).every(key => allowed.includes(key));
}

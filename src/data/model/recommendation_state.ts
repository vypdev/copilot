import { parseImplementationPlan, type ImplementationPlan } from '../../domain/implementation_plan';
import { canonicalizeLocaleTag } from '../../domain/locale';

export interface RecommendationState {
    readonly issueDescriptionFingerprint: string;
    readonly recommendationFingerprint: string;
    readonly implementationPlan: ImplementationPlan;
    readonly implementationPlanLocale: string;
}

export function isRecommendationState(value: unknown): value is RecommendationState {
    return restoreRecommendationState(value) !== undefined;
}

export function restoreRecommendationState(value: unknown): RecommendationState | undefined {
    if (typeof value !== 'object' || value === null) return undefined;

    const candidate = value as Record<string, unknown>;
    const allowedKeys = new Set([
        'issueDescriptionFingerprint',
        'recommendationFingerprint',
        'implementationPlan',
        'implementationPlanLocale',
    ]);
    if (Object.keys(candidate).some(key => !allowedKeys.has(key))) return undefined;
    const scalarFieldsValid = typeof candidate.issueDescriptionFingerprint === 'string'
        && candidate.issueDescriptionFingerprint.length > 0
        && typeof candidate.recommendationFingerprint === 'string'
        && candidate.recommendationFingerprint.length > 0
        && typeof candidate.implementationPlanLocale === 'string';
    if (!scalarFieldsValid) return undefined;
    const implementationPlan = parseImplementationPlan(candidate.implementationPlan);
    if (!implementationPlan) return undefined;
    let implementationPlanLocale: string;
    try {
        implementationPlanLocale = canonicalizeLocaleTag(candidate.implementationPlanLocale as string);
    } catch {
        return undefined;
    }
    return Object.freeze({
        issueDescriptionFingerprint: candidate.issueDescriptionFingerprint as string,
        recommendationFingerprint: candidate.recommendationFingerprint as string,
        implementationPlan,
        implementationPlanLocale,
    });
}

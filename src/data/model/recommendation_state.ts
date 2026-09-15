import { parseImplementationPlan, type ImplementationPlan } from '../../domain/implementation_plan';
import { canonicalizeLocaleTag } from '../../domain/locale';

export interface RecommendationState {
    readonly issueDescriptionFingerprint: string;
    readonly recommendationFingerprint: string;
    readonly recommendation: string;
    readonly implementationPlan?: ImplementationPlan;
    readonly implementationPlanLocale?: string;
}

export function isRecommendationState(value: unknown): value is RecommendationState {
    return restoreRecommendationState(value) !== undefined;
}

export function restoreRecommendationState(value: unknown): RecommendationState | undefined {
    if (typeof value !== 'object' || value === null) return undefined;

    const candidate = value as Record<string, unknown>;
    const legacyFieldsValid = typeof candidate.issueDescriptionFingerprint === 'string'
        && candidate.issueDescriptionFingerprint.length > 0
        && typeof candidate.recommendationFingerprint === 'string'
        && candidate.recommendationFingerprint.length > 0
        && typeof candidate.recommendation === 'string'
        && candidate.recommendation.length > 0;
    if (!legacyFieldsValid) return undefined;
    const implementationPlan = candidate.implementationPlan === undefined
        ? undefined
        : parseImplementationPlan(candidate.implementationPlan);
    if (candidate.implementationPlan !== undefined && !implementationPlan) return undefined;
    let implementationPlanLocale: string | undefined;
    if (candidate.implementationPlanLocale !== undefined) {
        if (!implementationPlan || typeof candidate.implementationPlanLocale !== 'string') return undefined;
        try {
            implementationPlanLocale = canonicalizeLocaleTag(candidate.implementationPlanLocale);
        } catch {
            return undefined;
        }
    }
    return Object.freeze({
        issueDescriptionFingerprint: candidate.issueDescriptionFingerprint as string,
        recommendationFingerprint: candidate.recommendationFingerprint as string,
        recommendation: candidate.recommendation as string,
        ...(implementationPlan ? { implementationPlan } : {}),
        ...(implementationPlanLocale ? { implementationPlanLocale } : {}),
    });
}

export interface RecommendationState {
    issueDescriptionFingerprint: string;
    recommendationFingerprint: string;
    recommendation: string;
}

export function isRecommendationState(value: unknown): value is RecommendationState {
    if (typeof value !== 'object' || value === null) return false;

    const candidate = value as Record<string, unknown>;
    return typeof candidate.issueDescriptionFingerprint === 'string'
        && candidate.issueDescriptionFingerprint.length > 0
        && typeof candidate.recommendationFingerprint === 'string'
        && candidate.recommendationFingerprint.length > 0
        && typeof candidate.recommendation === 'string'
        && candidate.recommendation.length > 0;
}

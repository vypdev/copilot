export interface RecommendationState {
    issueDescriptionFingerprint: string;
    recommendationFingerprint: string;
    recommendation: string;
}
export declare function isRecommendationState(value: unknown): value is RecommendationState;

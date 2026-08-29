export declare const NO_NEW_RECOMMENDATIONS = "NO_NEW_RECOMMENDATIONS";
export declare const MAX_STORED_RECOMMENDATION_LENGTH = 12000;
export declare function getVisibleIssueDescription(description: string): string;
export declare function createIssueDescriptionFingerprint(description: string): string;
export declare function createRecommendationFingerprint(recommendation: string): string;
export declare function isNoNewRecommendation(response: string): boolean;
export declare function limitStoredRecommendation(recommendation: string): string;

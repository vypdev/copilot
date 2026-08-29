export type RecommendStepsParams = {
    projectContextInstruction: string;
    issueNumber: string;
    issueDescription: string;
    previousRecommendation?: string;
};
export declare function getRecommendStepsPrompt(params: RecommendStepsParams): string;

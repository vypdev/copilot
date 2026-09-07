export declare const PROGRESS_RESPONSE_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly progress: {
            readonly type: "number";
            readonly minimum: 0;
            readonly maximum: 100;
            readonly description: "Completion percentage 0-100";
        };
        readonly summary: {
            readonly type: "string";
            readonly minLength: 1;
            readonly maxLength: 8000;
            readonly description: "Short explanation of the assessment";
        };
        readonly remaining: {
            readonly type: "string";
            readonly maxLength: 8000;
            readonly description: "When progress < 100: what is left to do to reach 100%. Omit or empty when progress is 100.";
        };
    };
    readonly required: readonly ["progress", "summary"];
    readonly additionalProperties: false;
};
export interface ProgressAttemptResult {
    progress: number;
    summary: string;
    reasoning: string;
    remaining: string;
}
export declare function parseProgressResponse(response: unknown): ProgressAttemptResult;

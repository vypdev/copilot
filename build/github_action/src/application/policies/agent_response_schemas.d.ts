/** Shared structured-response contracts used by agent-backed application flows. */
export declare const TRANSLATION_RESPONSE_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly translatedText: {
            readonly type: "string";
            readonly description: "The text translated to the requested locale. Required. Must not be empty.";
        };
        readonly reason: {
            readonly type: "string";
            readonly description: "Optional: reason why translation could not be produced or was partial (e.g. ambiguous input).";
        };
    };
    readonly required: readonly ["translatedText"];
    readonly additionalProperties: false;
};
export declare const THINK_RESPONSE_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly answer: {
            readonly type: "string";
            readonly description: "The concise answer to the user question. Required.";
        };
    };
    readonly required: readonly ["answer"];
    readonly additionalProperties: false;
};
export declare const LANGUAGE_CHECK_RESPONSE_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly status: {
            readonly type: "string";
            readonly enum: readonly ["done", "must_translate"];
            readonly description: "done if text is in the requested locale, must_translate otherwise.";
        };
    };
    readonly required: readonly ["status"];
    readonly additionalProperties: false;
};

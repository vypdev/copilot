export interface ThinkCommandOptions {
    issue?: unknown;
    branch?: unknown;
    debug?: boolean;
    token?: unknown;
    question?: unknown;
    aiIgnoreFiles?: unknown;
    includeReasoning?: unknown;
}
/** Adapts Commander input into the local action contract used by the Think workflow. */
export declare function runThinkCommand(options: ThinkCommandOptions): Promise<void>;

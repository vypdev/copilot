export type ActionInputValues = Record<string, unknown>;
/**
 * Resolves one action input without coupling the caller to a specific lifecycle.
 * Explicit runtime parameters always override YAML/environment defaults.
 */
export declare function resolveJsonInput(inputVarsJson: string | undefined, key: string): string | undefined;
export declare function resolveActionInput<T = string>(additionalParams: ActionInputValues, actionInputs: ActionInputValues, key: string): T;

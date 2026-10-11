export type ActionInputValues = Record<string, unknown>;

/**
 * Resolves one action input without coupling the caller to a specific lifecycle.
 * Explicit runtime parameters always override YAML/environment defaults.
 */
export function resolveJsonInput(
    inputVarsJson: string | undefined,
    key: string,
): string | undefined {
    if (!inputVarsJson) {
        return undefined;
    }

    const inputVars = JSON.parse(inputVarsJson) as Record<string, unknown>;
    const value = inputVars[`INPUT_${key.toUpperCase()}`];
    return value === undefined ? undefined : String(value);
}

export function resolveActionInput<T = string>(
    additionalParams: ActionInputValues,
    actionInputs: ActionInputValues,
    key: string,
): T {
    return (additionalParams[key] ?? actionInputs[key]) as T;
}

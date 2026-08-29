export interface GithubErrorShape {
    status?: number;
    message?: string;
    response?: unknown;
}

export const getGithubErrorStatus = (error: unknown): number | undefined => {
    if (typeof error !== "object" || error === null) return undefined;
    const status = (error as GithubErrorShape).status;
    return typeof status === "number" ? status : undefined;
};

export const isGithubNotFound = (error: unknown): boolean => getGithubErrorStatus(error) === 404;

export const isGithubAlreadyExists = (error: unknown): boolean => {
    if (getGithubErrorStatus(error) !== 422) return false;
    return hasAlreadyExistsValidationCode(error) || hasAlreadyExistsMessage(error);
};

function hasAlreadyExistsValidationCode(error: unknown): boolean {
    const responseData = readRecord(readRecord(error)?.response)?.data;
    const validationErrors = readRecord(responseData)?.errors;
    return Array.isArray(validationErrors)
        && validationErrors.some((validationError) => readRecord(validationError)?.code === "already_exists");
}

function hasAlreadyExistsMessage(error: unknown): boolean {
    const message = readRecord(error)?.message;
    if (typeof message !== "string") return false;
    const normalized = message.toLowerCase();
    return normalized.includes("already exists") || normalized.includes("already_exists");
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

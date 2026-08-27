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
    const shape = typeof error === "object" && error !== null ? (error as GithubErrorShape) : undefined;
    if (getGithubErrorStatus(error) !== 422) return false;

    const responseData = typeof shape?.response === "object" && shape.response !== null && "data" in shape.response
        ? shape.response.data
        : undefined;
    const validationErrors = typeof responseData === "object" && responseData !== null && "errors" in responseData
        ? responseData.errors
        : undefined;
    const hasAlreadyExistsCode = Array.isArray(validationErrors) && validationErrors.some(validationError => (
        typeof validationError === "object"
        && validationError !== null
        && "code" in validationError
        && validationError.code === "already_exists"
    ));
    const message = typeof shape?.message === "string" ? shape.message.toLowerCase() : "";
    return hasAlreadyExistsCode
        || message.includes("already exists")
        || message.includes("already_exists");
};

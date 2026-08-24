export interface GithubErrorShape {
    status?: number;
    message?: string;
    response?: unknown;
}
export declare const getGithubErrorStatus: (error: unknown) => number | undefined;
export declare const isGithubNotFound: (error: unknown) => boolean;
export declare const isGithubAlreadyExists: (error: unknown) => boolean;

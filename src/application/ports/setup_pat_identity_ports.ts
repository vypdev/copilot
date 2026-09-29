export interface SetupGithubIdentity {
    readonly id: number;
    readonly login: string;
}

export interface SetupGithubIdentityQueryPort {
    resolve(login: string, setupToken: string): Promise<SetupGithubIdentity>;
    identify(token: string): Promise<SetupGithubIdentity>;
}

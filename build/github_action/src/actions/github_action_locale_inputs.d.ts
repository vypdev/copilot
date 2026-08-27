export interface GithubActionLocaleInputs {
    readonly issue: string;
    readonly pullRequest: string;
}
export declare function readGithubActionLocaleInputs(getInput: (key: string) => string): GithubActionLocaleInputs;

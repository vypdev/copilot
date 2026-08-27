export interface GithubActionWorkflowInputs {
    readonly release: string;
    readonly hotfix: string;
}
export declare function readGithubActionWorkflowInputs(getInput: (key: string) => string): GithubActionWorkflowInputs;

import { INPUT_KEYS } from '../application/contracts/input_keys';

export interface GithubActionWorkflowInputs {
    readonly release: string;
    readonly hotfix: string;
}

export function readGithubActionWorkflowInputs(getInput: (key: string) => string): GithubActionWorkflowInputs {
    return {
        release: getInput(INPUT_KEYS.RELEASE_WORKFLOW),
        hotfix: getInput(INPUT_KEYS.HOTFIX_WORKFLOW),
    };
}

import type { Execution } from '../data/model/execution';
import type { ProjectDetailQueryPort } from '../application/ports/project_detail_ports';
import { getGithubActionInput } from './github_action_input';
import type { buildGithubActionEventInputs } from './github_event_inputs';
export interface GithubActionExecutionInput {
    readonly getInput: typeof getGithubActionInput;
    readonly eventInputs: ReturnType<typeof buildGithubActionEventInputs>;
    readonly projectQuery: ProjectDetailQueryPort;
    readonly debug: boolean;
}
export declare function buildGithubActionExecution(input: GithubActionExecutionInput): Promise<Execution>;

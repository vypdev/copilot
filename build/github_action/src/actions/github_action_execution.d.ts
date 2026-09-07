import { SingleAction } from '../data/model/single_action';
import type { Execution } from '../data/model/execution';
import type { ProjectDetailQueryPort } from '../application/ports/project_detail_ports';
import { getGithubActionInput } from './github_action_input';
import { readGithubActionAiInputs } from './github_action_ai_inputs';
import type { buildGithubActionEventInputs } from './github_event_inputs';
import { activeAgentTasks } from '../application/policies/agent_task_activation_policy';
export interface GithubActionExecutionInput {
    readonly getInput: typeof getGithubActionInput;
    readonly eventInputs: ReturnType<typeof buildGithubActionEventInputs>;
    readonly projectQuery: ProjectDetailQueryPort;
    readonly debug: boolean;
    readonly token: string;
    readonly tokenUser: string;
    readonly singleAction: SingleAction;
    readonly aiInputs?: ReturnType<typeof readGithubActionAiInputs>;
    readonly activeAgentTasks?: ReturnType<typeof activeAgentTasks>;
    readonly agentRuntimeAuthorized?: boolean;
}
export declare function buildGithubActionExecution(input: GithubActionExecutionInput): Promise<Execution>;
export declare function readGithubActionSingleAction(getInput: typeof getGithubActionInput): SingleAction;

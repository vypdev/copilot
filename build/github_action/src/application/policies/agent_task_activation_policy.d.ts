import type { AgentTask } from '../../domain/agent';
import type { SingleAction } from '../../data/model/single_action';
import type { GithubActionEventInputs } from '../../actions/github_event_inputs';
/** Returns only roles that can be reached by the current event or single action. */
export declare function activeAgentTasks(event: GithubActionEventInputs, singleAction: SingleAction, botLogin?: string, pullRequestDescriptionEnabled?: boolean): AgentTask[];

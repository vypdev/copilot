import {
    OctokitWorkflowDispatchClientAdapter,
    OctokitWorkflowRunsClientAdapter,
} from "../github/octokit_workflow_adapters";

export const createWorkflowRunsClient = () => new OctokitWorkflowRunsClientAdapter();
export const createWorkflowDispatchClient = () => new OctokitWorkflowDispatchClientAdapter();

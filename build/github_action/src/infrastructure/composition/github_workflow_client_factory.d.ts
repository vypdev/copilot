import { OctokitWorkflowDispatchClientAdapter, OctokitWorkflowRunsClientAdapter } from "../github/octokit_workflow_adapters";
export declare const createWorkflowRunsClient: () => OctokitWorkflowRunsClientAdapter;
export declare const createWorkflowDispatchClient: () => OctokitWorkflowDispatchClientAdapter;

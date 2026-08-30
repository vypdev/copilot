import type { Execution } from "../../data/model/execution";
export interface DeployWorkflowPlan {
    kind: "release" | "hotfix";
    branch: string;
    workflow: string;
    version: string;
    title: string;
    changelog: string;
    issue: number;
}
export declare function resolveDeployWorkflowPlan(param: Execution): DeployWorkflowPlan | undefined;

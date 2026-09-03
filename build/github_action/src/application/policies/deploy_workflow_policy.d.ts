export interface DeployWorkflowExecutionContext {
    readonly issue: {
        readonly labeled: boolean;
        readonly labelAdded: string;
        readonly number: number;
        readonly title: string;
        readonly body: string;
    };
    readonly labels: {
        readonly deploy: string;
    };
    readonly release: {
        readonly active: boolean;
        readonly branch?: string;
        readonly version?: string;
    };
    readonly hotfix: {
        readonly active: boolean;
        readonly branch?: string;
        readonly version?: string;
    };
    readonly workflows: {
        readonly release: string;
        readonly hotfix: string;
    };
}
export interface DeployWorkflowPlan {
    kind: "release" | "hotfix";
    branch: string;
    workflow: string;
    version: string;
    title: string;
    changelog: string;
    issue: number;
}
export declare function resolveDeployWorkflowPlan(param: DeployWorkflowExecutionContext): DeployWorkflowPlan | undefined;

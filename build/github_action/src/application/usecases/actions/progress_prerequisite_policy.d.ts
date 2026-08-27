export interface ProgressPrerequisites {
    agentReady: boolean;
    issueNumber: number;
    issueDescription?: string;
    branch?: string;
}
export declare function validateProgressPrerequisites(input: ProgressPrerequisites): string | undefined;

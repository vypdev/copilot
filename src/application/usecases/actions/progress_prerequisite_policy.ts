export interface ProgressPrerequisites {
    agentReady: boolean;
    issueNumber: number;
    issueDescription?: string;
    branch?: string;
}

export function validateProgressPrerequisites(input: ProgressPrerequisites): string | undefined {
    if (!input.agentReady) {
        return 'Missing required agent configuration. Provide a model and a valid CLI command.';
    }
    if (input.issueNumber === -1) {
        return 'Issue number not found. Cannot check progress without an issue number.';
    }
    if (input.issueDescription === '') {
        return `Could not retrieve issue description for issue #${input.issueNumber}`;
    }
    if (!input.branch) {
        return `Could not find branch for issue #${input.issueNumber}. Please ensure a branch exists with pattern: feature/${input.issueNumber}-*, bugfix/${input.issueNumber}-*, docs/${input.issueNumber}-*, or chore/${input.issueNumber}-*`;
    }
    return undefined;
}

import type { InitialIssueTypeConfiguration } from '../../../application/ports/issue_management_ports';

export interface ConfiguredIssueType {
    readonly name: string;
    readonly description: string;
    readonly color: string;
}

/** Maps the domain issue-type catalog to the provider-neutral provisioning input. */
export function configuredIssueTypes(issueTypes: InitialIssueTypeConfiguration): readonly ConfiguredIssueType[] {
    return [
        { name: issueTypes.task, description: issueTypes.taskDescription, color: issueTypes.taskColor },
        { name: issueTypes.bug, description: issueTypes.bugDescription, color: issueTypes.bugColor },
        { name: issueTypes.feature, description: issueTypes.featureDescription, color: issueTypes.featureColor },
        { name: issueTypes.documentation, description: issueTypes.documentationDescription, color: issueTypes.documentationColor },
        { name: issueTypes.maintenance, description: issueTypes.maintenanceDescription, color: issueTypes.maintenanceColor },
        { name: issueTypes.hotfix, description: issueTypes.hotfixDescription, color: issueTypes.hotfixColor },
        { name: issueTypes.release, description: issueTypes.releaseDescription, color: issueTypes.releaseColor },
        { name: issueTypes.question, description: issueTypes.questionDescription, color: issueTypes.questionColor },
        { name: issueTypes.help, description: issueTypes.helpDescription, color: issueTypes.helpColor },
    ].filter(type => type.name.trim().length > 0);
}

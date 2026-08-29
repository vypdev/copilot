import type { Labels } from '../../model/labels';
import type { IssueTypes } from '../../model/issue_types';

export interface SelectedIssueType {
    name: string;
    description: string;
    color: string;
}

/** Maps the highest-priority issue label to the configured GitHub issue type. */
export function selectIssueType(labels: Labels, issueTypes: IssueTypes): SelectedIssueType {
    const candidates: Array<[boolean, string, string, string]> = [
        [labels.isHotfix, issueTypes.hotfix, issueTypes.hotfixDescription, issueTypes.hotfixColor],
        [labels.isRelease, issueTypes.release, issueTypes.releaseDescription, issueTypes.releaseColor],
        [labels.isDocs || labels.isDocumentation, issueTypes.documentation, issueTypes.documentationDescription, issueTypes.documentationColor],
        [labels.isChore || labels.isMaintenance, issueTypes.maintenance, issueTypes.maintenanceDescription, issueTypes.maintenanceColor],
        [labels.isBugfix || labels.isBug, issueTypes.bug, issueTypes.bugDescription, issueTypes.bugColor],
        [labels.isFeature || labels.isEnhancement, issueTypes.feature, issueTypes.featureDescription, issueTypes.featureColor],
        [labels.isHelp, issueTypes.help, issueTypes.helpDescription, issueTypes.helpColor],
        [labels.isQuestion, issueTypes.question, issueTypes.questionDescription, issueTypes.questionColor],
    ];
    const selected = candidates.find(([matches]) => matches);
    const [, name, description, color] = selected ?? [false, issueTypes.task, issueTypes.taskDescription, issueTypes.taskColor];
    return { name, description, color };
}

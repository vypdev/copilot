import type { Labels } from '../../model/labels';
import type { IssueTypes } from '../../model/issue_types';
export interface SelectedIssueType {
    name: string;
    description: string;
    color: string;
}
/** Maps the highest-priority issue label to the configured GitHub issue type. */
export declare function selectIssueType(labels: Labels, issueTypes: IssueTypes): SelectedIssueType;

import type { IssueTypes } from '../../model/issue_types';
export interface ConfiguredIssueType {
    readonly name: string;
    readonly description: string;
    readonly color: string;
}
/** Maps the domain issue-type catalog to the provider-neutral provisioning input. */
export declare function configuredIssueTypes(issueTypes: IssueTypes): readonly ConfiguredIssueType[];

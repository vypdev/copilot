import { Execution } from "../../../data/model/execution";
import type { IssueDescriptionCommandPort, IssueDescriptionQueryPort } from "../../../application/ports/issue_description_ports";
import { ContentInterface } from "./content_interface";
export declare abstract class IssueContentInterface extends ContentInterface {
    protected readonly issueDescriptionPort: IssueDescriptionQueryPort & IssueDescriptionCommandPort;
    constructor(issueDescriptionPort: IssueDescriptionQueryPort & IssueDescriptionCommandPort);
    internalGetter: (execution: Execution) => Promise<string | undefined>;
    internalUpdate: (execution: Execution, content: string) => Promise<string | undefined>;
}

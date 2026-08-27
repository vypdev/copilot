/**
 * Orchestrates publication of bugbot findings to issue comments and PR review comments.
 * Issue publication, PR review policy, and overflow reporting live in dedicated collaborators.
 */
import type { Execution } from "../../../../../data/model/execution";
import type { BugbotFindingPublicationPorts } from "../../../../../application/ports/bugbot_finding_publication_ports";
import type { BugbotContext, BugbotFinding } from "./types";
export interface PublishFindingsParam {
    execution: Execution;
    context: BugbotContext;
    findings: BugbotFinding[];
    /** Commit SHA for bugbot watermark (commit link). When set, comment uses "for commit ..." watermark. */
    commitSha?: string;
    /** When findings were limited by max comments, add one summary comment with this overflow info. */
    overflowCount?: number;
    overflowTitles?: string[];
    ports: BugbotFindingPublicationPorts;
}
export declare function publishFindings(param: PublishFindingsParam): Promise<void>;

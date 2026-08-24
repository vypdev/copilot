import { getBugbotFixIntentPayload } from "./bugbot_fix_intent_payload";
import type { Result } from "../../../../../data/model/result";
import type { Execution } from "../../../../../data/model/execution";
import type { AuthenticatedUserPort } from "../../../../../application/ports/authenticated_user_ports";
import type { BugbotFindingResolutionPorts } from "../../../../../application/ports/bugbot_finding_resolution_ports";
import type { GitCommitPort } from "../../../../../application/ports/git_ports";
export declare function commitAutofixAndResolveFindings(param: Execution, payload: NonNullable<ReturnType<typeof getBugbotFixIntentPayload>>, autofixResults: Result[], authenticatedUserPort: AuthenticatedUserPort, bugbotResolutionPorts: BugbotFindingResolutionPorts, gitCommitPort: GitCommitPort): Promise<Error[]>;

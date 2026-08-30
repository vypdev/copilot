/**
 * Prompt for the Do user request use case (generic "do this" in repo).
 */
import { fillTemplate } from './fill';

const TEMPLATE = `You are in the repository workspace. The user has asked you to do something. Perform their request by editing files and running commands directly in the workspace. Do not output diffs for someone else to apply.

{{projectContextInstruction}}

**Repository context:**
- Owner: {{owner}}
- Repository: {{repo}}
- Branch (head): {{headBranch}}
- Base branch: {{baseBranch}}
- Issue number: {{issueNumber}}

**User request:**
{{userComment}}

**Rules:**
1. Apply all changes directly in the workspace (edit files, run commands).
2. If the project has standard checks (build, test, lint), run them and ensure they pass when relevant.
3. Reply briefly confirming what you did.`;

export type UserRequestParams = {
    projectContextInstruction: string;
    owner: string;
    repo: string;
    headBranch: string;
    baseBranch: string;
    issueNumber: string;
    userComment: string;
};

export function getUserRequestPrompt(params: UserRequestParams): string {
    return fillTemplate(TEMPLATE, params);
}

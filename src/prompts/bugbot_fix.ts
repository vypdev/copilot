/**
 * Prompt for Bugbot autofix (fix selected findings in workspace).
 */
import { fillTemplate } from './fill';

const TEMPLATE = `You are in the repository workspace. Your task is to fix the reported code findings (bugs, vulnerabilities, or quality issues) listed below, and only those. The user has explicitly requested these fixes.

{{projectContextInstruction}}

**Repository context:**
- Owner: {{owner}}
- Repository: {{repo}}
- Branch (head): {{headBranch}}
- Base branch: {{baseBranch}}
- Issue number: {{issueNumber}}
{{prNumberLine}}

**Findings to fix (do not change code unrelated to these):**
{{findingsBlock}}

**User request:**
{{userComment}}

**Rules:**
1. Fix only the problems described in the findings above. Do not refactor or change other code except as strictly necessary for the fix.
2. You may add or update tests only to validate that the fix is correct.
3. After applying changes, run the verify commands (or standard build/test/lint) and ensure they all pass. If they fail, adjust the fix until they pass.
4. Apply all changes directly in the workspace (edit files, run commands). Do not output diffs for someone else to apply.
{{verifyBlock}}

Once the fixes are applied and the verify commands pass, reply briefly confirming what was fixed and that checks passed.`;

export type BugbotFixParams = {
    projectContextInstruction: string;
    owner: string;
    repo: string;
    headBranch: string;
    baseBranch: string;
    issueNumber: string;
    prNumberLine: string;
    findingsBlock: string;
    userComment: string;
    verifyBlock: string;
};

export function getBugbotFixPrompt(params: BugbotFixParams): string {
    return fillTemplate(TEMPLATE, {
        ...params,
        issueNumber: String(params.issueNumber),
    });
}

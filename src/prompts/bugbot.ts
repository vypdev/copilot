/**
 * Prompt for Bugbot detection (detect potential problems on push).
 */
import { fillTemplate } from './fill';

const TEMPLATE = `You are analyzing the latest code changes for potential bugs and issues.

{{projectContextInstruction}}

**Repository context:**
- Owner: {{owner}}
- Repository: {{repo}}
- Branch (head): {{headBranch}}
- Base branch: {{baseBranch}}
- Issue number: {{issueNumber}}
{{ignoreBlock}}

**Your task 1 (new/current problems):** {{changeScopeInstruction}} Then identify potential bugs, logic errors, security issues, and code quality problems. Be strict and descriptive. One finding per distinct problem. Return them in the \`findings\` array (each with id, title, description; optionally file, line, severity, suggestion). Only include findings in files that are not in the ignore list above.
{{previousBlock}}

**Output:** Return a JSON object with: "findings" (array of new/current problems from task 1), and if we gave you previously reported issues above, "resolved_finding_ids" (array of those ids that are now fixed or no longer apply, as per task 2). Optionally return "resolved_finding_reasons" as an object mapping those exact ids to "fixed" or "obsolete". Never resolve an id that was not included in the previous-findings list.`;

export type BugbotParams = {
    projectContextInstruction: string;
    owner: string;
    repo: string;
    headBranch: string;
    baseBranch: string;
    issueNumber: string;
    changeScopeInstruction: string;
    ignoreBlock: string;
    previousBlock: string;
};

export function getBugbotPrompt(params: BugbotParams): string {
    return fillTemplate(TEMPLATE, {
        ...params,
        issueNumber: String(params.issueNumber),
    });
}

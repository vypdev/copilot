/**
 * Prompt for detecting if user comment is a fix request and which finding ids to target.
 */
import { fillTemplate } from './fill';

const TEMPLATE = `You are analyzing a user comment on an issue or pull request to decide whether they are asking to fix one or more reported code findings (bugs, vulnerabilities, or quality issues).

{{projectContextInstruction}}

**List of unresolved findings (id, title, and optional file/line/description):**
{{findingsBlock}}
{{parentBlock}}
**User comment:**
{{userComment}}

**Your task:** Decide:
1. Is this comment clearly a request to fix one or more of the findings above? (e.g. "fix it", "arreglalo", "fix this", "fix all", "fix vulnerability X", "corrige", "fix the bug in src/foo.ts"). If the user is asking a question, discussing something else, or the intent is ambiguous, set \`is_fix_request\` to false.
2. If it is a fix request, which finding ids should be fixed? Return their exact ids in \`target_finding_ids\`. If the user says "fix all" or equivalent, include every id from the list above. If they refer to a specific finding (e.g. by replying to a comment that contains one finding), return only that finding's id. Use only ids that appear in the list above.
3. Is the user asking to perform some other change or task in the repo? (e.g. "add a test for X", "refactor this", "implement feature Y", "haz que Z"). If yes, set \`is_do_request\` to true. Set false for pure questions or when the only intent is to fix the listed findings.

Respond with a JSON object: \`is_fix_request\` (boolean), \`target_finding_ids\` (array of strings; empty when \`is_fix_request\` is false), and \`is_do_request\` (boolean).`;

export type BugbotFixIntentParams = {
    projectContextInstruction: string;
    findingsBlock: string;
    parentBlock: string;
    userComment: string;
};

export function getBugbotFixIntentPrompt(params: BugbotFixIntentParams): string {
    return fillTemplate(TEMPLATE, params);
}

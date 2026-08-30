/**
 * Prompt for generating PR description from issue and diff (UpdatePullRequestDescriptionUseCase).
 */
import { fillTemplate } from './fill';

const TEMPLATE = `You are in the repository workspace. Your task is to produce a pull request description by filling the project's PR template with information from the branch diff and the issue.

{{projectContextInstruction}}

**Branches:**
- **Base (target) branch:** \`{{baseBranch}}\`
- **Head (source) branch:** \`{{headBranch}}\`

**Instructions:**
1. Read the pull request template file: \`.github/pull_request_template.md\`. Use its structure (headings, bullet lists, separators) as the skeleton for your output. The checkboxes in the template are **indicative only**: you may check the ones that apply based on the project and the diff, define different or fewer checkboxes if that fits better, or omit a section entirely if it does not apply.
2. Get the full diff by running: \`git diff {{baseBranch}}..{{headBranch}}\` (or \`git diff {{baseBranch}}...{{headBranch}}\` for merge-base). Use the diff to understand what changed.
3. Use the issue description below for context and intent.
4. Fill each section of the template with concrete content derived from the diff and the issue. Keep the same markdown structure (headings, horizontal rules). For checkbox sections (e.g. Test Coverage, Deployment Notes, Security): use the template's options as guidance; check or add only the items that apply, or skip the section if it does not apply.
   - **Summary:** brief explanation of what the PR does and why (intent, not implementation details).
   - **Related Issues:** {{relatedIssueInstruction}}
   - **Scope of Changes:** use Added / Updated / Removed / Refactored with short bullet points (high level, not file-by-file).
   - **Technical Details:** important decisions, trade-offs, or non-obvious aspects.
   - **How to Test:** steps a reviewer can follow (infer from the changes when possible).
   - **Test Coverage / Deployment / Security / Performance / Checklist:** treat checkboxes as indicative; check the ones that apply from the diff and project context, or omit the section if it does not apply.
   - **Breaking Changes:** list any, or "None".
   - **Notes for Reviewers / Additional Context:** fill only if useful; otherwise a short placeholder or omit.
5. Do not output a single compact paragraph. Output the full filled template so the PR description is well-structured and easy to scan. Preserve the template's formatting (headings with # and ##, horizontal rules). Use checkboxes \`- [ ]\` / \`- [x]\` only where they add value; you may simplify or drop a section if it does not apply.
6. **Output format:** Return only the filled template content. Do not add any preamble, meta-commentary, or framing phrases (e.g. "Based on my analysis...", "After reviewing the diff...", "Here is the description..."). Start directly with the first heading of the template (e.g. # Summary). Do not wrap the output in code blocks.

**Issue description:**
{{issueDescription}}

Output only the filled template content (the PR description body), starting with the first heading. No preamble, no commentary.`;

export type UpdatePullRequestDescriptionParams = {
    projectContextInstruction: string;
    baseBranch: string;
    headBranch: string;
    issueNumber: string;
    issueDescription: string;
    relatedIssueInstruction: string;
};

export function getUpdatePullRequestDescriptionPrompt(params: UpdatePullRequestDescriptionParams): string {
    return fillTemplate(TEMPLATE, {
        projectContextInstruction: params.projectContextInstruction,
        baseBranch: params.baseBranch,
        headBranch: params.headBranch,
        issueNumber: String(params.issueNumber),
        issueDescription: params.issueDescription,
        relatedIssueInstruction: params.relatedIssueInstruction,
    });
}

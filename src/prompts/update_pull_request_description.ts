/**
 * Prompt for generating a concise PR description from an optional issue and the diff.
 */
import { fillTemplate } from './fill';

const TEMPLATE = `You are in the repository workspace. Your task is to write a concise, review-ready pull request description from the branch diff and any linked issue.

Write every human-readable sentence in {{targetLocale}}. Preserve code identifiers, paths, refs, commands, URLs, issue/PR references, and conventional title prefixes verbatim. Echo \`outputLocale\` exactly as \`{{targetLocale}}\`.

{{projectContextInstruction}}

**Branches:**
- **Base (target) branch:** \`{{baseBranch}}\`
- **Head (source) branch:** \`{{headBranch}}\`

**Instructions:**
1. Read \`.github/pull_request_template.md\` as content guidance and repository-specific constraints. Do not reproduce empty placeholder sections or treat every heading as mandatory.
2. Get the full merge-base diff with \`git diff {{baseBranch}}...{{headBranch}}\`. Use it to understand the behavior and contracts that changed.
3. Use the issue description below for context and intent.
4. Provide \`overview\` as one to three sentences that state the outcome and why it matters.
5. Provide \`whatChangedHeading\` as the plain-text {{targetLocale}} equivalent of "What changed" and \`changes\` as two to six short, outcome-oriented items. Do not inventory files, use-case names, internal categories, or every implementation step.
6. When execution or manual-verification evidence is available, provide \`validationHeading\` as the plain-text {{targetLocale}} equivalent of "Validation" and \`validation\` with only the supported commands, automated checks, or manual scenarios. Never claim a check passed unless the evidence says it did, and never infer that result from the presence of test files or commands. When no verification evidence is available, set both fields to \`null\`; do not add a “not run” placeholder.
7. Set \`reviewNotesHeading\` and \`reviewNotes\` to \`null\` unless reviewers need material security, performance, compatibility, rollout, manual-verification, risk, or follow-up context. Do not infer consumers, compatibility obligations, upgrade steps, migration work, or rollout requirements merely because code, configuration, inputs, state shapes, markers, or symbols were removed, tightened, made fail-closed, or named deprecated or legacy. When repository evidence explicitly says there are no installed users, external consumers, or persisted production state, treat that as conclusive evidence that removed contracts require no migration note. Do not use review notes to restate greenfield removals, strict parsing, rejected old shapes, or the absence of migration work; those are ordinary change outcomes when material. Include a review note only when the issue, diff, repository documentation, or verification evidence identifies a concrete affected consumer, required transition, reviewer action, or unresolved risk. Otherwise use the localized plain-text heading and one to four concise items. {{relatedIssueInstruction}}
8. Keep the description practical and normally under 4,000 characters. It must never exceed 12,000 characters. Do not use emoji, horizontal separators, generic checklists, empty headings, repeated statements, placeholder text, or unsupported "no impact" claims.
9. Return one JSON object with exactly \`outputLocale\`, \`overview\`, \`whatChangedHeading\`, \`changes\`, \`validationHeading\`, \`validation\`, \`reviewNotesHeading\`, \`reviewNotes\`, and \`closesLinkedIssue\`. Every content field is plain text except Markdown links, code spans, refs, and commands inside content values. The application renders the Markdown structure; do not include headings, bullet prefixes, a preamble, meta-commentary, or code fence in the values.

**Issue description:**
{{issueDescription}}

Return the structured JSON response only.`;

export type UpdatePullRequestDescriptionParams = {
    projectContextInstruction: string;
    baseBranch: string;
    headBranch: string;
    issueNumber: string;
    issueDescription: string;
    relatedIssueInstruction: string;
    targetLocale: string;
};

export function getUpdatePullRequestDescriptionPrompt(params: UpdatePullRequestDescriptionParams): string {
    return fillTemplate(TEMPLATE, {
        projectContextInstruction: params.projectContextInstruction,
        baseBranch: params.baseBranch,
        headBranch: params.headBranch,
        issueNumber: String(params.issueNumber),
        issueDescription: params.issueDescription,
        relatedIssueInstruction: params.relatedIssueInstruction,
        targetLocale: params.targetLocale,
    });
}

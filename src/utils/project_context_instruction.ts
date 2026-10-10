/** Shared repository-context instruction for every supported agent runtime. */
export const PROJECT_CONTEXT_INSTRUCTION = `**Important – use full project context:** In addition to reading the relevant code (respecting any file ignore patterns specified), read the repository documentation (e.g. README, docs/) and any defined rules or conventions (e.g. .cursor/rules, CONTRIBUTING, project guidelines). This gives you a complete picture of the project and leads to better decisions in both quality of reasoning and efficiency.`;


/** Product facts that remain available when a read-only agent cannot inspect local files. */
export const COPILOT_ISSUE_WORKFLOW_INSTRUCTION = `Trusted Copilot issue workflow facts:
- Creating an eligible Issue Form admits the issue but does not start work. An authorized maintainer adds the exact in-progress label to start work; the Action does not add it automatically during admission.
- When pre-branch-sdd is enabled, feature issues and branch-bearing contract-change issues resolve blocking SDD questions before drafting a document. Answers use SDD Q1: text, one line per question.
- The Action validates the SDD draft, creates or reuses the exact linked branch, publishes and verifies the SDD commit, and only then marks the issue branched. A retained branch without a verified SDD commit is blocked for implementation.
- Help issues remain branchless.
- These facts are conditional on the actual enabled repository configuration. Do not invent additional flags, labels, automatic transitions, or existing branches/documents.`;

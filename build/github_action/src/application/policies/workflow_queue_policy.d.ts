/**
 * Workflows that execute the Copilot action and therefore share its
 * repository mutation queue. Keep these names aligned with workflow `name`
 * values in `.github/workflows` and the setup templates.
 */
export declare const COPILOT_WORKFLOW_NAMES: readonly ["Copilot - Issue", "Copilot - Issue Comment", "Copilot - Commit", "Copilot - Pull Request", "Copilot - Pull Request Comment", "Task - Hotfix", "Task - Release"];

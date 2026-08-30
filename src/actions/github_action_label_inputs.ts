import { INPUT_KEYS } from '../utils/constants';
import type { LabelValues } from './configuration_builders';

export function readGithubActionLabelInputs(getInput: (key: string) => string): LabelValues {
    return {
        branching: { launcher: getInput(INPUT_KEYS.BRANCH_MANAGEMENT_LAUNCHER_LABEL) },
        workflow: {
            bug: getInput(INPUT_KEYS.BUG_LABEL), bugfix: getInput(INPUT_KEYS.BUGFIX_LABEL),
            hotfix: getInput(INPUT_KEYS.HOTFIX_LABEL), enhancement: getInput(INPUT_KEYS.ENHANCEMENT_LABEL),
            feature: getInput(INPUT_KEYS.FEATURE_LABEL), release: getInput(INPUT_KEYS.RELEASE_LABEL),
            question: getInput(INPUT_KEYS.QUESTION_LABEL), help: getInput(INPUT_KEYS.HELP_LABEL),
            deploy: getInput(INPUT_KEYS.DEPLOY_LABEL), deployed: getInput(INPUT_KEYS.DEPLOYED_LABEL),
            docs: getInput(INPUT_KEYS.DOCS_LABEL), documentation: getInput(INPUT_KEYS.DOCUMENTATION_LABEL),
            chore: getInput(INPUT_KEYS.CHORE_LABEL), maintenance: getInput(INPUT_KEYS.MAINTENANCE_LABEL),
        },
        priorities: {
            high: getInput(INPUT_KEYS.PRIORITY_HIGH_LABEL), medium: getInput(INPUT_KEYS.PRIORITY_MEDIUM_LABEL),
            low: getInput(INPUT_KEYS.PRIORITY_LOW_LABEL), none: getInput(INPUT_KEYS.PRIORITY_NONE_LABEL),
        },
        sizes: {
            xxl: getInput(INPUT_KEYS.SIZE_XXL_LABEL), xl: getInput(INPUT_KEYS.SIZE_XL_LABEL),
            l: getInput(INPUT_KEYS.SIZE_L_LABEL), m: getInput(INPUT_KEYS.SIZE_M_LABEL),
            s: getInput(INPUT_KEYS.SIZE_S_LABEL), xs: getInput(INPUT_KEYS.SIZE_XS_LABEL),
        },
        lifecycle: {
            analyzing: getInput(INPUT_KEYS.COPILOT_STATE_ANALYZING_LABEL),
            planned: getInput(INPUT_KEYS.COPILOT_STATE_PLANNED_LABEL),
            inProgress: getInput(INPUT_KEYS.COPILOT_STATE_IN_PROGRESS_LABEL),
            reviewing: getInput(INPUT_KEYS.COPILOT_STATE_REVIEWING_LABEL),
            changesRequested: getInput(INPUT_KEYS.COPILOT_STATE_CHANGES_REQUESTED_LABEL),
            verified: getInput(INPUT_KEYS.COPILOT_STATE_VERIFIED_LABEL),
            ready: getInput(INPUT_KEYS.COPILOT_STATE_READY_LABEL),
            blocked: getInput(INPUT_KEYS.COPILOT_STATE_BLOCKED_LABEL),
        },
    };
}

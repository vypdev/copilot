import { INPUT_KEYS } from '../utils/constants';
import type { BranchValues } from './branches_builder';

export function readGithubActionBranchInputs(getInput: (key: string) => string): BranchValues {
    const main = getInput(INPUT_KEYS.MAIN_BRANCH);
    return {
        main,
        defaultBranch: main,
        development: getInput(INPUT_KEYS.DEVELOPMENT_BRANCH),
        featureTree: getInput(INPUT_KEYS.FEATURE_TREE),
        bugfixTree: getInput(INPUT_KEYS.BUGFIX_TREE),
        hotfixTree: getInput(INPUT_KEYS.HOTFIX_TREE),
        releaseTree: getInput(INPUT_KEYS.RELEASE_TREE),
        docsTree: getInput(INPUT_KEYS.DOCS_TREE),
        choreTree: getInput(INPUT_KEYS.CHORE_TREE),
    };
}

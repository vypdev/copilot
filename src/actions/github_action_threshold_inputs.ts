import { INPUT_KEYS } from '../utils/constants';
import { parseIntegerInput } from './input_number_policy';
import type { SizeThresholdSet } from './size_threshold_builder';

export function readGithubActionThresholdInputs(getInput: (key: string) => string): SizeThresholdSet {
    return {
        xxl: {
            lines: parseIntegerInput(getInput(INPUT_KEYS.SIZE_XXL_THRESHOLD_LINES), 1000),
            files: parseIntegerInput(getInput(INPUT_KEYS.SIZE_XXL_THRESHOLD_FILES), 20),
            commits: parseIntegerInput(getInput(INPUT_KEYS.SIZE_XXL_THRESHOLD_COMMITS), 10),
        },
        xl: {
            lines: parseIntegerInput(getInput(INPUT_KEYS.SIZE_XL_THRESHOLD_LINES), 500),
            files: parseIntegerInput(getInput(INPUT_KEYS.SIZE_XL_THRESHOLD_FILES), 10),
            commits: parseIntegerInput(getInput(INPUT_KEYS.SIZE_XL_THRESHOLD_COMMITS), 5),
        },
        l: {
            lines: parseIntegerInput(getInput(INPUT_KEYS.SIZE_L_THRESHOLD_LINES), 250),
            files: parseIntegerInput(getInput(INPUT_KEYS.SIZE_L_THRESHOLD_FILES), 5),
            commits: parseIntegerInput(getInput(INPUT_KEYS.SIZE_L_THRESHOLD_COMMITS), 3),
        },
        m: {
            lines: parseIntegerInput(getInput(INPUT_KEYS.SIZE_M_THRESHOLD_LINES), 100),
            files: parseIntegerInput(getInput(INPUT_KEYS.SIZE_M_THRESHOLD_FILES), 3),
            commits: parseIntegerInput(getInput(INPUT_KEYS.SIZE_M_THRESHOLD_COMMITS), 2),
        },
        s: {
            lines: parseIntegerInput(getInput(INPUT_KEYS.SIZE_S_THRESHOLD_LINES), 50),
            files: parseIntegerInput(getInput(INPUT_KEYS.SIZE_S_THRESHOLD_FILES), 2),
            commits: parseIntegerInput(getInput(INPUT_KEYS.SIZE_S_THRESHOLD_COMMITS), 1),
        },
        xs: {
            lines: parseIntegerInput(getInput(INPUT_KEYS.SIZE_XS_THRESHOLD_LINES), 25),
            files: parseIntegerInput(getInput(INPUT_KEYS.SIZE_XS_THRESHOLD_FILES), 1),
            commits: parseIntegerInput(getInput(INPUT_KEYS.SIZE_XS_THRESHOLD_COMMITS), 1),
        },
    };
}

import { Locale } from '../data/model/locale';
import { INPUT_KEYS } from '../application/contracts/input_keys';

export interface GithubActionLocaleInputs {
    readonly issue: string;
    readonly pullRequest: string;
}

export function readGithubActionLocaleInputs(getInput: (key: string) => string): GithubActionLocaleInputs {
    return {
        issue: getInput(INPUT_KEYS.ISSUES_LOCALE) || Locale.DEFAULT,
        pullRequest: getInput(INPUT_KEYS.PULL_REQUESTS_LOCALE) || Locale.DEFAULT,
    };
}

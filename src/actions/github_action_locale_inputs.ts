import { Locale } from '../data/model/locale';
import { INPUT_KEYS } from '../application/contracts/input_keys';
import { resolveLocaleProfile } from '../domain/locale';

export interface GithubActionLocaleInputs {
    readonly repository: string;
    readonly issue: string;
    readonly pullRequest: string;
    readonly issueOverride?: string;
    readonly pullRequestOverride?: string;
}

export function readGithubActionLocaleInputs(getInput: (key: string) => string): GithubActionLocaleInputs {
    return resolveLocaleProfile(
        getInput(INPUT_KEYS.REPOSITORY_LOCALE) || Locale.DEFAULT,
        getInput(INPUT_KEYS.ISSUES_LOCALE),
        getInput(INPUT_KEYS.PULL_REQUESTS_LOCALE),
    );
}

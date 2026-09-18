import { DEFAULT_REPOSITORY_LOCALE, resolveLocaleProfile } from '../../domain/locale';

export class Locale {
    static readonly DEFAULT = DEFAULT_REPOSITORY_LOCALE;

    readonly repository: string;
    readonly issue: string;
    readonly pullRequest: string;
    readonly issueOverride?: string;
    readonly pullRequestOverride?: string;

    constructor(repository: string = Locale.DEFAULT, issue: string = '', pullRequest: string = '') {
        const profile = resolveLocaleProfile(repository, issue, pullRequest);
        this.repository = profile.repository;
        this.issue = profile.issue;
        this.pullRequest = profile.pullRequest;
        this.issueOverride = profile.issueOverride;
        this.pullRequestOverride = profile.pullRequestOverride;
        Object.freeze(this);
    }
}

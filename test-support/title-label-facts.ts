import type { TitleLabelFacts } from '../src/application/ports/issue_title_ports';

export function titleLabelFacts(overrides: Partial<TitleLabelFacts> = {}): TitleLabelFacts {
    return { isHotfix: false, isRelease: false, isBugfix: false, isBug: false,
        isFeature: false, isEnhancement: false, isDocs: false, isDocumentation: false,
        isChore: false, isMaintenance: false, isHelp: false, isQuestion: false,
        containsBranchedLabel: false, ...overrides };
}

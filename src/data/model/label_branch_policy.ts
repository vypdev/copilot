export interface LabelBranchContext {
    branches: {
        bugfixTree: string;
        releaseTree: string;
        docsTree: string;
        choreTree: string;
        featureTree: string;
        hotfixTree: string;
    };
}

interface LabelNames {
    feature: string;
    enhancement: string;
    bugfix: string;
    bug: string;
    hotfix: string;
    release: string;
    docs: string;
    documentation: string;
    chore: string;
    maintenance: string;
}

type BranchKey = keyof LabelBranchContext['branches'];

export const branchesForManagement = (
    params: LabelBranchContext,
    labels: string[],
    featureLabel: string,
    enhancementLabel: string,
    bugfixLabel: string,
    bugLabel: string,
    hotfixLabel: string,
    releaseLabel: string,
    docsLabel: string,
    documentationLabel: string,
    choreLabel: string,
    maintenanceLabel: string,
): string => {
    return resolveBranch(params, labels, {
        feature: featureLabel,
        enhancement: enhancementLabel,
        bugfix: bugfixLabel,
        bug: bugLabel,
        hotfix: hotfixLabel,
        release: releaseLabel,
        docs: docsLabel,
        documentation: documentationLabel,
        chore: choreLabel,
        maintenance: maintenanceLabel,
    }, 'bugfixTree');
};

export const typesForIssue = (
    params: LabelBranchContext,
    labels: string[],
    featureLabel: string,
    enhancementLabel: string,
    bugfixLabel: string,
    bugLabel: string,
    hotfixLabel: string,
    releaseLabel: string,
    docsLabel: string,
    documentationLabel: string,
    choreLabel: string,
    maintenanceLabel: string,
): string => {
    return resolveBranch(params, labels, {
        feature: featureLabel,
        enhancement: enhancementLabel,
        bugfix: bugfixLabel,
        bug: bugLabel,
        hotfix: hotfixLabel,
        release: releaseLabel,
        docs: docsLabel,
        documentation: documentationLabel,
        chore: choreLabel,
        maintenance: maintenanceLabel,
    }, 'hotfixTree');
};

function resolveBranch(
    params: LabelBranchContext,
    labels: string[],
    names: LabelNames,
    hotfixBranch: BranchKey,
): string {
    const rules: Array<{ names: string[]; branch: BranchKey }> = [
        { names: [names.hotfix], branch: hotfixBranch },
        { names: [names.bugfix, names.bug], branch: 'bugfixTree' },
        { names: [names.release], branch: 'releaseTree' },
        { names: [names.docs, names.documentation], branch: 'docsTree' },
        { names: [names.chore, names.maintenance], branch: 'choreTree' },
        { names: [names.feature, names.enhancement], branch: 'featureTree' },
    ];
    const matchingRule = rules.find((rule) => rule.names.some((name) => labels.includes(name)));
    return params.branches[matchingRule?.branch ?? 'featureTree'];
}

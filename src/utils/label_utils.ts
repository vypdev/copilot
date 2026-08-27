interface LabelBranchContext {
    branches: {
        bugfixTree: string;
        releaseTree: string;
        docsTree: string;
        choreTree: string;
        featureTree: string;
        hotfixTree: string;
    };
}

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
    if (labels.includes(hotfixLabel)) return params.branches.bugfixTree;
    if (labels.includes(bugfixLabel) || labels.includes(bugLabel)) return params.branches.bugfixTree;
    if (labels.includes(releaseLabel)) return params.branches.releaseTree;
    if (labels.includes(docsLabel) || labels.includes(documentationLabel)) return params.branches.docsTree;
    if (labels.includes(choreLabel) || labels.includes(maintenanceLabel)) return params.branches.choreTree;
    if (labels.includes(featureLabel) || labels.includes(enhancementLabel)) return params.branches.featureTree;
    return params.branches.featureTree;
}

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
    if (labels.includes(hotfixLabel)) return params.branches.hotfixTree;
    if (labels.includes(bugfixLabel) || labels.includes(bugLabel)) return params.branches.bugfixTree;
    if (labels.includes(releaseLabel)) return params.branches.releaseTree;
    if (labels.includes(docsLabel) || labels.includes(documentationLabel)) return params.branches.docsTree;
    if (labels.includes(choreLabel) || labels.includes(maintenanceLabel)) return params.branches.choreTree;
    if (labels.includes(featureLabel) || labels.includes(enhancementLabel)) return params.branches.featureTree;
    return params.branches.featureTree;
}
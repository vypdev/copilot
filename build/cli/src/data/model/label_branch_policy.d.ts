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
export declare const branchesForManagement: (params: LabelBranchContext, labels: string[], featureLabel: string, enhancementLabel: string, bugfixLabel: string, bugLabel: string, hotfixLabel: string, releaseLabel: string, docsLabel: string, documentationLabel: string, choreLabel: string, maintenanceLabel: string) => string;
export declare const typesForIssue: (params: LabelBranchContext, labels: string[], featureLabel: string, enhancementLabel: string, bugfixLabel: string, bugLabel: string, hotfixLabel: string, releaseLabel: string, docsLabel: string, documentationLabel: string, choreLabel: string, maintenanceLabel: string) => string;

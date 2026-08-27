export class Branches {
    main: string;
    defaultBranch: string;
    development: string;
    featureTree: string;
    bugfixTree: string;
    hotfixTree: string;
    releaseTree: string;
    docsTree: string;
    choreTree: string;

    constructor(
        main: string,
        defaultBranch: string,
        development: string,
        featureTree: string,
        bugfixTree: string,
        hotfixTree: string,
        releaseTree: string,
        docsTree: string,
        choreTree: string,
    ) {
        this.main = main;
        this.defaultBranch = defaultBranch;
        this.development = development;
        this.featureTree = featureTree;
        this.bugfixTree = bugfixTree;
        this.hotfixTree = hotfixTree;
        this.releaseTree = releaseTree;
        this.docsTree = docsTree;
        this.choreTree = choreTree;
    }
}
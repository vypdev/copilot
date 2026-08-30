import type { ResultPublicationContext, ResultPublicationPresentation } from './result_publication_contracts';

type ImageSelector = (images: string[]) => string | undefined;

export function selectResultPublicationPresentation(
    context: ResultPublicationContext,
    selectImage: ImageSelector,
): ResultPublicationPresentation {
    if (context.isIssue) return selectIssuePresentation(context, selectImage);
    if (context.isPullRequest) return selectPullRequestPresentation(context, selectImage);
    return { title: '🪄 Automatic Actions' };
}

function selectIssuePresentation(context: ResultPublicationContext, selectImage: ImageSelector): ResultPublicationPresentation {
    if (context.issueNotBranched) return presentation('🪄 Automatic Actions', context.images.issueAutomaticActions, selectImage);
    if (context.releaseActive) return presentation('🚀 Release Actions', context.images.issueReleaseGifs, selectImage);
    if (context.hotfixActive) return presentation('🔥🐛 Hotfix Actions', context.images.issueHotfixGifs, selectImage);
    if (context.isBugfix) return presentation('🐛 Bugfix Actions', context.images.issueBugfixGifs, selectImage);
    if (context.isFeature) return presentation('✨ Feature Actions', context.images.issueFeatureGifs, selectImage);
    if (context.isDocs) return presentation('📝 Documentation Actions', context.images.issueDocsGifs, selectImage);
    if (context.isChore) return presentation('🔧 Chore Actions', context.images.issueChoreGifs, selectImage);
    return { title: '🪄 Automatic Actions' };
}

function selectPullRequestPresentation(context: ResultPublicationContext, selectImage: ImageSelector): ResultPublicationPresentation {
    if (context.releaseActive) return presentation('🚀 Release Actions', context.images.pullRequestReleaseGifs, selectImage);
    if (context.hotfixActive) return presentation('🔥🐛 Hotfix Actions', context.images.pullRequestHotfixGifs, selectImage);
    if (context.isBugfix) return presentation('🐛 Bugfix Actions', context.images.pullRequestBugfixGifs, selectImage);
    if (context.isFeature) return presentation('✨ Feature Actions', context.images.pullRequestFeatureGifs, selectImage);
    if (context.isDocs) return presentation('📝 Documentation Actions', context.images.pullRequestDocsGifs, selectImage);
    if (context.isChore) return presentation('🔧 Chore Actions', context.images.pullRequestChoreGifs, selectImage);
    return presentation('🪄 Automatic Actions', context.images.pullRequestAutomaticActions, selectImage);
}

function presentation(title: string, images: string[], selectImage: ImageSelector): ResultPublicationPresentation {
    return { title, image: selectImage(images) };
}

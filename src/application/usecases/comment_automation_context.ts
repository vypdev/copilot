import type { SddDiffRequest } from '../ports/sdd_diff_read_ports';
import type { DoctorConfiguration } from '../ports/github_runtime_doctor_ports';
import type { IssueWorkflowProfile } from '../../domain/issue_workflow_profile';
import { ISSUE_WORKFLOW_KINDS } from '../../domain/issue_workflow_profile';
import type { SddEvidenceQueryContext } from '../ports/sdd_evidence_read_ports';
import type { BugbotReviewConfiguration } from '../../domain/bugbot/review_configuration';
import {
    buildCopilotStatusSnapshot,
    type CopilotStatusExecutionContext,
    type CopilotStatusSnapshot,
} from '../policies/status_command_policy';
import {
    projectCommentLanguageRequest,
    type CommentLanguageRequest,
} from './steps/common/comment_language_translation_workflow';
import { projectThinkContext, type ThinkContext, type ThinkContextSource } from './steps/common/think_workflow';
import {
    projectBugbotAutofixOperationContext,
    projectBugbotCommitContext,
    projectBugbotFixIntentContext,
    projectBugbotReviewOperationContext,
    type BugbotAutofixOperationContext,
    type BugbotAutofixOperationSource,
    type BugbotCommitContext,
    type BugbotCommitSource,
    type BugbotFixIntentContext,
    type BugbotFixIntentSource,
    type BugbotReviewOperationContext,
    type BugbotReviewOperationSource,
} from './steps/commit/bugbot/bugbot_review_operation_context';
import {
    projectBranchSyncContext,
    projectUserRequestContext,
    type BranchSyncContext,
    type PushSingleActionContextSource,
    type UserRequestContext,
} from './push_single_action_contexts';
import type { CommentLanguageAdaptationPayload } from './steps/common/comment_language_translation_workflow';
import { buildExplicitCommandQuestion } from './steps/common/think_request_policy';
import { extractMentionQuestion } from './steps/common/think_input_policy';
import { parseCopilotCommand } from '../../domain/copilot_command';

export interface CommentAutomationContext {
    readonly doctorConfiguration?: DoctorConfiguration;
    readonly actor: string;
    readonly trustedBotLogin: string;
    readonly userComment: string;
    readonly membersOnly: boolean;
    readonly language: CommentLanguageRequest;
    readonly think: ThinkContext;
    readonly status: CopilotStatusSnapshot;
    readonly sdd?: SddEvidenceQueryContext;
    readonly sddDiff?: SddDiffRequest;
    readonly userRequest: UserRequestContext;
    readonly branchSync: BranchSyncContext;
    readonly bugbot: {
        readonly fixIntent: BugbotFixIntentContext;
        readonly review: BugbotReviewOperationContext;
        readonly autofix: BugbotAutofixOperationContext;
        readonly commit: BugbotCommitContext;
        readonly publicationMode: BugbotReviewConfiguration['publicationMode'];
    };
}

export type CommentAutomationContextSource =
    & ThinkContextSource
    & CopilotStatusExecutionContext
    & BugbotFixIntentSource
    & BugbotReviewOperationSource
    & BugbotAutofixOperationSource
    & BugbotCommitSource
    & PushSingleActionContextSource
    & {
        readonly actor: string;
        readonly issueWorkflowProfile?: IssueWorkflowProfile;
        readonly inputs?: { readonly repository?: { readonly id?: number }; readonly issue?: { readonly number?: number; readonly user?: { readonly login?: string } } };
        readonly labels: CopilotStatusExecutionContext['labels'] & Readonly<Partial<Record<'feature' | 'enhancement' | 'bugfix' | 'bug' | 'documentation' | 'docs' | 'chore' | 'maintenance' | 'help' | 'question' | 'hotfix' | 'release', string>>>;
        readonly tokenUser?: string;
        readonly preBranchSdd?: boolean;
        readonly issue: ThinkContextSource['issue'] & { readonly issueManagedBranches?: boolean };

        readonly ai: BugbotReviewOperationSource['ai']
            & BugbotAutofixOperationSource['ai']
            & ThinkContextSource['ai']
            & CopilotStatusExecutionContext['ai']
            & {
                getAiMembersOnly(): boolean;
                getBugbotReviewConfiguration(): BugbotReviewConfiguration;
            };
    };

export function projectCommentAutomationContext(
    source: CommentAutomationContextSource,
    language: CommentLanguageRequest,
    userComment: string,
): CommentAutomationContext {
    const review = projectBugbotReviewOperationContext(source);
    return Object.freeze({
        ...(source.issueWorkflowProfile && typeof source.preBranchSdd === 'boolean'
            && typeof source.issue.issueManagedBranches === 'boolean' ? { doctorConfiguration: Object.freeze({
                profile: Object.freeze({ schemaVersion: source.issueWorkflowProfile.schemaVersion,
                    enabled: Object.freeze([...source.issueWorkflowProfile.enabled]) }),
                labels: Object.freeze({
                    feature: Object.freeze([source.labels?.feature, source.labels?.enhancement].filter((value): value is string => typeof value === 'string' && value.length > 0)),
                    bugfix: Object.freeze([source.labels?.bugfix, source.labels?.bug].filter((value): value is string => typeof value === 'string' && value.length > 0)),
                    documentation: Object.freeze([source.labels?.documentation, source.labels?.docs].filter((value): value is string => typeof value === 'string' && value.length > 0)),
                    chore: Object.freeze([source.labels?.chore, source.labels?.maintenance].filter((value): value is string => typeof value === 'string' && value.length > 0)),
                    help: Object.freeze([source.labels?.help, source.labels?.question].filter((value): value is string => typeof value === 'string' && value.length > 0)),
                    release: Object.freeze([source.labels?.release].filter((value): value is string => typeof value === 'string' && value.length > 0)),
                    hotfix: Object.freeze([source.labels?.hotfix].filter((value): value is string => typeof value === 'string' && value.length > 0)),
                }),
                preBranchSdd: source.preBranchSdd, issueManagedBranches: source.issue.issueManagedBranches,
                dependencyBranch: source.currentConfiguration.parentBranch ?? source.branches.development ?? '',
            }) } : {}),
        actor: source.actor,
        trustedBotLogin: source.tokenUser?.trim() ?? '',
        userComment,
        membersOnly: source.ai.getAiMembersOnly(),
        language: projectCommentLanguageRequest({
            commentBody: language.commentBody,
            locale: language.locale,
            issueNumber: language.issueNumber,
            commentId: language.commentId,
            trustedBotLogin: language.trustedBotLogin,
            configuration: language.configuration === undefined
                ? undefined
                : { ...language.configuration },
        }),
        think: projectThinkContext(source),
        status: buildCopilotStatusSnapshot(source),
        ...projectSddDiffRequest(source),
        ...(source.issue?.number > 0 && !(source.pullRequest?.number > 0) ? { sdd: Object.freeze({
            issueNumber: source.issue.number,
            admittedKind: ISSUE_WORKFLOW_KINDS.find(kind => kind === source.issueWorkflowKind),
            profileDigest: source.issueWorkflowProfileDigest,
            issueAuthor: source.issue.creator ?? '',
            trustedBotLogin: source.tokenUser?.trim() ?? '',
            issueManagedBranches: source.issue.issueManagedBranches,
            preBranchSdd: source.preBranchSdd,
            baseBranch: source.branches?.development,
        }) } : {}),
        userRequest: projectUserRequestContext(source),
        branchSync: projectBranchSyncContext(source),
        bugbot: Object.freeze({
            fixIntent: projectBugbotFixIntentContext(source),
            review,
            autofix: projectBugbotAutofixOperationContext(source),
            commit: projectBugbotCommitContext(source),
            publicationMode: review.analysis.reviewConfiguration.publicationMode,
        }),
    });
}

/** Applies model-produced interpretation only to prose-bearing context copies. */
export function withCommentLanguageAdaptation(
    context: CommentAutomationContext,
    adaptation: CommentLanguageAdaptationPayload,
): CommentAutomationContext {
    if (adaptation.status !== 'translated') return context;
    const userComment = adaptation.interpretedComment;
    const parsed = parseCopilotCommand(userComment);
    const think: ThinkContext = context.think.request.kind === 'ready' && 'agentTask' in context.think
        ? Object.freeze({
            request: Object.freeze({
                ...context.think.request,
                commentBody: userComment,
                question: parsed.kind === 'command'
                    ? buildExplicitCommandQuestion(parsed.command)
                    : extractMentionQuestion(userComment, context.trustedBotLogin),
                ...(parsed.kind === 'command' ? { command: parsed.command } : {}),
            }),
            ...(context.think.tokenUser ? { tokenUser: context.think.tokenUser } : {}),
            agentTask: context.think.agentTask,
            agentConfiguration: context.think.agentConfiguration,
            targetLocale: context.think.targetLocale,
            ...(adaptation.publication ? { translationPublication: adaptation.publication } : {}),
        })
        : context.think;
    return Object.freeze({
        ...context,
        userComment,
        think,
        bugbot: Object.freeze({
            ...context.bugbot,
            fixIntent: Object.freeze({
                ...context.bugbot.fixIntent,
                comment: Object.freeze({ ...context.bugbot.fixIntent.comment, body: userComment }),
            }),
        }),
    });
}

/** Copies trusted workflow/profile facts; PR issue identity/author come only from the native link query. */
function projectSddDiffRequest(source: CommentAutomationContextSource): { readonly sddDiff?: SddDiffRequest } {
    const status = buildCopilotStatusSnapshot(source);
    const repositoryId = source.inputs?.repository?.id;
    const number = status.target === 'pull-request' ? status.pullRequestNumber : status.issueNumber;
    if (!Number.isSafeInteger(repositoryId) || !repositoryId || repositoryId < 1 || !number || number < 1
        || !source.issueWorkflowProfile || typeof source.issue.issueManagedBranches !== 'boolean'
        || typeof source.preBranchSdd !== 'boolean') return {};
    const list = (...values: (string | undefined)[]) => Object.freeze(values.filter((value): value is string => typeof value === 'string'));
    const labels = source.labels;
    return { sddDiff: Object.freeze({
        target: Object.freeze({ kind: status.target as 'issue' | 'pull-request', number }), repositoryId,
        ...(status.target === 'issue' && source.inputs?.issue?.number === number
            ? { issueAuthor: source.inputs.issue.user?.login } : {}),
        profile: Object.freeze({ schemaVersion: source.issueWorkflowProfile.schemaVersion, enabled: Object.freeze([...source.issueWorkflowProfile.enabled]) }),
        labelConfiguration: Object.freeze({ feature: list(labels.feature, labels.enhancement), bugfix: list(labels.bugfix, labels.bug),
            documentation: list(labels.documentation, labels.docs), chore: list(labels.chore, labels.maintenance),
            help: list(labels.help, labels.question), hotfix: list(labels.hotfix), release: list(labels.release) }),
        profileDigest: source.issueWorkflowProfileDigest, trustedBotLogin: source.tokenUser?.trim() ?? '',
        issueManagedBranches: source.issue.issueManagedBranches, preBranchSdd: source.preBranchSdd, baseBranch: source.branches?.development,
    }) };
}

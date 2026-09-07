import { hasVisibleCommentContent } from '../../domain/comment_content_policy';
import { INPUT_KEYS } from '../contracts/input_keys';

export type IssueCommentPublicationMode = 'create' | 'replace' | 'append';

export interface IssueCommentPublicationInput {
    readonly message: string;
    readonly commentId: number;
    readonly commentIdInput: string;
    readonly commentMode: string;
}

export type IssueCommentPublicationRequest =
    | { mode: 'create'; message: string }
    | { mode: 'replace' | 'append'; message: string; commentId: number };

export function resolveIssueCommentPublicationRequest(
    input: IssueCommentPublicationInput,
): IssueCommentPublicationRequest | Error {
    if (!hasVisibleCommentContent(input.message)) {
        return new Error(`${INPUT_KEYS.SINGLE_ACTION_MESSAGE} must contain a visible message.`);
    }
    if (input.commentIdInput.length > 0 && input.commentId <= 0) {
        return new Error(`${INPUT_KEYS.SINGLE_ACTION_COMMENT_ID} must be a positive integer.`);
    }

    const mode = resolveMode(input.commentMode, input.commentId);
    if (!mode) {
        return new Error(`${INPUT_KEYS.SINGLE_ACTION_COMMENT_MODE} must be create, replace, or append.`);
    }
    if (mode === 'create') {
        if (input.commentId > 0) {
            return new Error(`${INPUT_KEYS.SINGLE_ACTION_COMMENT_ID} cannot be set when comment mode is create.`);
        }
        return { mode, message: input.message };
    }
    if (input.commentId <= 0) {
        return new Error(`${INPUT_KEYS.SINGLE_ACTION_COMMENT_ID} must be a positive integer when comment mode is ${mode}.`);
    }
    return { mode, message: input.message, commentId: input.commentId };
}

function resolveMode(mode: string, commentId: number): IssueCommentPublicationMode | undefined {
    if (mode.length === 0) return commentId > 0 ? 'replace' : 'create';
    return mode === 'create' || mode === 'replace' || mode === 'append' ? mode : undefined;
}

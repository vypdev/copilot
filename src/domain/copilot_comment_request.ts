import { parseCopilotCommand } from './copilot_command';

/** Matches GitHub usernames case-insensitively without matching a larger username. */
export function containsBotMention(commentBody: string, tokenUser: string): boolean {
    const normalizedUser = tokenUser.trim().replace(/^@/u, '');
    if (!normalizedUser) return false;
    const escapedUsername = normalizedUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9_-])@${escapedUsername}(?=$|[^A-Za-z0-9_-])`, 'iu').test(commentBody);
}

/**
 * Comment automation is opt-in: a bounded command prefix or an exact bot
 * mention is required. Unaddressed human and machine comments are inert.
 */
export function isCopilotCommentRequest(commentBody: string, botLogin: string): boolean {
    return parseCopilotCommand(commentBody).kind !== 'none'
        || containsBotMention(commentBody, botLogin);
}

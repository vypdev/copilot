/** Explicit commands are the safe, deterministic entry point for mutations. */
export const COPILOT_COMMAND_NAMES = [
    'plan',
    'clarify',
    'estimate',
    'test-plan',
    'status',
    'review',
    'findings',
    'fix',
    'dismiss',
    'recheck',
] as const;

export type CopilotCommandName = typeof COPILOT_COMMAND_NAMES[number];

export interface ParsedCopilotCommand {
    readonly name: CopilotCommandName;
    readonly arguments: readonly string[];
    readonly raw: string;
}

export type CopilotCommandParseResult =
    | { readonly kind: 'none' }
    | { readonly kind: 'command'; readonly command: ParsedCopilotCommand }
    | { readonly kind: 'invalid'; readonly reason: string };

const COMMAND_PREFIX = /^\/copilot(?:\s+|$)/iu;
const MAX_COMMAND_LENGTH = 2_000;
const MAX_ARGUMENTS = 20;

/**
 * Parses only a command at the beginning of a comment. Everything else is
 * ordinary user data and must continue through the existing agent flow.
 */
export function parseCopilotCommand(raw: unknown): CopilotCommandParseResult {
    if (typeof raw !== 'string' || !/^\s*\/copilot(?:\s|$)/iu.test(raw)) return { kind: 'none' };
    const input = raw.trim();
    if (input.length > MAX_COMMAND_LENGTH) {
        return { kind: 'invalid', reason: `Copilot commands must be at most ${MAX_COMMAND_LENGTH} characters.` };
    }

    const withoutPrefix = input.replace(COMMAND_PREFIX, '').trim();
    if (!withoutPrefix) return { kind: 'invalid', reason: 'Use /copilot followed by a command.' };
    const tokens = withoutPrefix.split(/\s+/u).filter(Boolean);
    const name = tokens.shift()?.toLowerCase();
    if (!name || !COPILOT_COMMAND_NAMES.includes(name as CopilotCommandName)) {
        return { kind: 'invalid', reason: `Unknown Copilot command. Supported commands: ${COPILOT_COMMAND_NAMES.join(', ')}.` };
    }
    if (tokens.length > MAX_ARGUMENTS) {
        return { kind: 'invalid', reason: `Copilot commands accept at most ${MAX_ARGUMENTS} arguments.` };
    }
    if ((name === 'fix' || name === 'dismiss') && tokens.length === 0) {
        return { kind: 'invalid', reason: `/${name} requires at least one finding id.` };
    }
    return {
        kind: 'command',
        command: { name: name as CopilotCommandName, arguments: tokens, raw: input },
    };
}

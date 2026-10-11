/** Explicit commands are the safe, deterministic entry point for mutations. */
export const COPILOT_COMMAND_NAMES = [
    'help',
    'analyze',
    'plan',
    'clarify',
    'estimate',
    'test-plan',
    'status',
    'history',
    'description',
    'explain',
    'diagnose',
    'review',
    'findings',
    'fix',
    'dismiss',
    'remember',
    'recheck',
    'implement',
    'sync-branch',
] as const;

export type CopilotCommandName = typeof COPILOT_COMMAND_NAMES[number];

const COPILOT_COMMANDS_WITH_ADAPTABLE_PROSE: ReadonlySet<CopilotCommandName> = new Set([
    'plan',
    'clarify',
    'estimate',
    'test-plan',
    'explain',
    'diagnose',
    'implement',
]);

/** Commands whose arguments may contain human prose that benefits from locale adaptation. */
export function copilotCommandAcceptsAdaptableProse(name: CopilotCommandName): boolean {
    return COPILOT_COMMANDS_WITH_ADAPTABLE_PROSE.has(name);
}

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
    const argumentsList = name === 'dismiss' || name === 'fix'
        ? parseFindingIdentifiers(withoutPrefix.slice(name.length).trim())
        : tokens;
    if (!argumentsList) {
        return { kind: 'invalid', reason: 'Use valid double-quoted finding IDs when an identifier contains spaces.' };
    }
    if (argumentsList.length > MAX_ARGUMENTS) {
        return { kind: 'invalid', reason: `Copilot commands accept at most ${MAX_ARGUMENTS} arguments.` };
    }
    if ((name === 'fix' || name === 'dismiss' || name === 'implement' || name === 'remember') && argumentsList.length === 0) {
        return { kind: 'invalid', reason: `/${name} requires at least one argument.` };
    }
    if (name === 'history' && argumentsList.length) {
        return { kind: 'invalid', reason: '/copilot history accepts no arguments or model selection.' };
    }
    return {
        kind: 'command',
        command: { name: name as CopilotCommandName, arguments: argumentsList, raw: input },
    };
}

/** JSON quoting preserves lossless finding identities without evaluating user input. */
function parseFindingIdentifiers(input: string): string[] | undefined {
    const identifiers: string[] = [];
    let cursor = 0;
    for (const match of input.matchAll(/(?:"(?:[^"\\]|\\.)*"|[^\s"]+)(?=\s|$)/gu)) {
        if (input.slice(cursor, match.index).trim()) return undefined;
        try {
            const identifier: string = match[0].startsWith('"') ? JSON.parse(match[0]) : match[0];
            if (!identifier.trim() || /[\r\n]/u.test(identifier)) return undefined;
            identifiers.push(identifier);
        } catch { return undefined; }
        cursor = match.index + match[0].length;
    }
    return input.slice(cursor).trim() ? undefined : identifiers;
}

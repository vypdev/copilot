import type { CopilotCommandValidationDiagnostic, CopilotCommandValidationReason } from './copilot_command_validation';

import { COPILOT_COMMAND_NAMES, type CopilotCommandName } from './copilot_command_vocabulary';
export { COPILOT_COMMAND_NAMES, type CopilotCommandName } from './copilot_command_vocabulary';

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
    | { readonly kind: 'invalid'; readonly reason: string; readonly validation: CopilotCommandValidationDiagnostic };

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
        return invalid('comment-command-length', 'help', `Copilot commands must be at most ${MAX_COMMAND_LENGTH} characters.`);
    }

    const withoutPrefix = input.replace(COMMAND_PREFIX, '').trim();
    if (!withoutPrefix) return invalid('comment-command-name-missing', 'help', 'Use /copilot followed by a command.');
    const tokens = withoutPrefix.split(/\s+/u).filter(Boolean);
    const name = tokens.shift()?.toLowerCase();
    if (!name || !COPILOT_COMMAND_NAMES.includes(name as CopilotCommandName)) {
        return invalid('comment-command-name-unknown', 'help', `Unknown Copilot command. Supported commands: ${COPILOT_COMMAND_NAMES.join(', ')}.`);
    }
    const commandName = name as CopilotCommandName;
    if (name === 'status' && tokens.length > 0) {
        return invalid('comment-command-arguments-unexpected', commandName, '/copilot status accepts no arguments.');
    }
    const argumentsList = name === 'dismiss' || name === 'fix'
        ? parseFindingIdentifiers(withoutPrefix.slice(name.length).trim())
        : tokens;
    if (!argumentsList) {
        return invalid('comment-command-finding-quoting', commandName, 'Use valid double-quoted finding IDs when an identifier contains spaces.');
    }
    if (argumentsList.length > MAX_ARGUMENTS
        && !copilotCommandAcceptsAdaptableProse(name as CopilotCommandName)
        && name !== 'remember') {
        return invalid('comment-command-argument-count', commandName, `Copilot commands accept at most ${MAX_ARGUMENTS} arguments.`);
    }
    if (name === 'sdd-diff' && argumentsList.length > 0) return invalid('comment-command-arguments-unexpected', commandName, '/copilot sdd-diff does not accept arguments.');
    if (name === 'doctor' && argumentsList.length > 0) {
        return invalid('comment-command-arguments-unexpected', commandName, '/copilot doctor does not accept arguments.');
    }
    if ((name === 'fix' || name === 'dismiss' || name === 'implement' || name === 'remember') && argumentsList.length === 0) {
        return invalid('comment-command-arguments-missing', commandName, `/${name} requires at least one argument.`);
    }
    if (name === 'history' && argumentsList.length) {
        return invalid('comment-command-arguments-unexpected', commandName, '/copilot history accepts no arguments or model selection.');
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

function invalid(reasonId: CopilotCommandValidationReason, command: CopilotCommandName, reason: string): CopilotCommandParseResult {
    return { kind: 'invalid', reason, validation: { reason: reasonId, command } };
}

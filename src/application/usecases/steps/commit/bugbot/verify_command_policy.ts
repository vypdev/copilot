import * as shellQuote from 'shell-quote';

export const MAX_VERIFY_COMMANDS = 20;

export interface ParsedVerifyCommand {
    program: string;
    args: string[];
}

export function parseVerifyCommand(cmd: string): ParsedVerifyCommand | null {
    const trimmed = cmd.trim();
    if (!trimmed) return null;
    try {
        const parsed = shellQuote.parse(trimmed, {});
        const argv = parsed.filter((entry): entry is string => typeof entry === 'string');
        if (argv.length !== parsed.length || argv.length === 0) return null;
        return { program: argv[0], args: argv.slice(1) };
    } catch {
        return null;
    }
}

export function limitVerifyCommands(commands: unknown[]): string[] {
    return commands
        .filter((command): command is string => typeof command === 'string')
        .slice(0, MAX_VERIFY_COMMANDS);
}

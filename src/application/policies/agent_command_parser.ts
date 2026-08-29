import * as shellQuote from 'shell-quote';

export interface ParsedAgentCommand {
    executable: string;
    args: string[];
}

/** Parses a literal agent command without allowing shell operators or substitutions. */
export function parseAgentCommand(command: string): ParsedAgentCommand {
    const trimmed = command.trim();
    if (!trimmed) throw new Error('Agent CLI command must not be empty.');
    const parsed = shellQuote.parse(trimmed, {});
    const argv = parsed.filter((entry): entry is string => typeof entry === 'string');
    if (argv.length !== parsed.length || argv.length === 0) {
        throw new Error('Agent CLI command contains unsupported shell syntax. Use an executable and literal arguments only.');
    }
    return { executable: argv[0], args: argv.slice(1) };
}

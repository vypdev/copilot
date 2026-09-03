import * as shellQuote from 'shell-quote';
import { ApplicationError } from '../errors/application_error';

export interface ParsedAgentCommand {
    executable: string;
    args: string[];
}

/** Parses a literal agent command without allowing shell operators or substitutions. */
export function parseAgentCommand(command: string): ParsedAgentCommand {
    const trimmed = command.trim();
    if (!trimmed) throw new ApplicationError('Agent CLI command must not be empty.', 'validation');
    const parsed = shellQuote.parse(trimmed, {});
    const argv = parsed.filter((entry): entry is string => typeof entry === 'string');
    if (argv.length !== parsed.length || argv.length === 0) {
        throw new ApplicationError(
            'Agent CLI command contains unsupported shell syntax. Use an executable and literal arguments only.',
            'validation',
        );
    }
    return { executable: argv[0], args: argv.slice(1) };
}

import { logError } from '../../../../ports/logging_ports';
import { parseVerifyCommand, type ParsedVerifyCommand } from './verify_command_policy';

export interface VerifyCommandResult {
    success: boolean;
    failedCommand?: string;
    error?: string;
}

export type VerifyCommandExecutor = (program: string, args: string[]) => Promise<number>;

export async function runVerifyCommands(
    commands: string[],
    execute: VerifyCommandExecutor,
): Promise<VerifyCommandResult> {
    for (const command of commands) {
        const result = await executeVerifyCommand(command, execute);
        if (!result.success) return result;
    }
    return { success: true };
}

async function executeVerifyCommand(
    command: string,
    execute: VerifyCommandExecutor,
): Promise<VerifyCommandResult> {
    const parsed = parseVerifyCommand(command);
    if (!parsed) return invalidCommand(command);
    try {
        const exitCode = await execute(parsed.program, parsed.args);
        return exitCode === 0
            ? { success: true }
            : { success: false, failedCommand: formatCommandForDiagnostics(parsed) };
   } catch {
        logError('Verify command failed.');
       return { success: false, failedCommand: formatCommandForDiagnostics(parsed) };
    }
}

function invalidCommand(command: string): VerifyCommandResult {
    const error = 'Invalid verify command (use no shell operators; quotes allowed).';
    logError(error, { commandLength: command.length });
    return { success: false, error };
}

function formatCommandForDiagnostics(command: ParsedVerifyCommand): string {
    const args: string[] = [];
    for (let index = 0; index < command.args.length; index += 1) {
        const argument = command.args[index];
        if (isSensitiveArgumentName(argument)) {
            args.push(argument, '[REDACTED]');
            index += 1;
            continue;
        }
        const assignment = argument.match(/^([A-Za-z_][A-Za-z0-9_-]*(?:key|token|secret|password|pat))=(.*)$/i);
        args.push(assignment ? `${assignment[1]}=[REDACTED]` : argument);
    }
    const formatted = [command.program, ...args].join(' ');
    return formatted.length > 500 ? `${formatted.slice(0, 500)}… [truncated]` : formatted;
}

function isSensitiveArgumentName(argument: string): boolean {
    return /^--?(?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|password|authorization|pat)$/i.test(argument);
}

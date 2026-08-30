import { logError } from '../../../../ports/logging_ports';
import { parseVerifyCommand } from './verify_command_policy';

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
        return exitCode === 0 ? { success: true } : { success: false, failedCommand: command };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`Verify command failed: ${command} - ${message}`);
        return { success: false, failedCommand: command };
    }
}

function invalidCommand(command: string): VerifyCommandResult {
    const error = `Invalid verify command (use no shell operators; quotes allowed): ${command}`;
    logError(error);
    return { success: false, failedCommand: command, error };
}

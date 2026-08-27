import { logError } from '../../../../../utils/logger';
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
        const parsed = parseVerifyCommand(command);
        if (!parsed) {
            const error = `Invalid verify command (use no shell operators; quotes allowed): ${command}`;
            logError(error);
            return { success: false, failedCommand: command, error };
        }
        try {
            const exitCode = await execute(parsed.program, parsed.args);
            if (exitCode !== 0) return { success: false, failedCommand: command };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`Verify command failed: ${command} - ${message}`);
            return { success: false, failedCommand: command };
        }
    }
    return { success: true };
}

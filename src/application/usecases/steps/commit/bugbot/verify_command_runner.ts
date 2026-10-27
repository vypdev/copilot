import { logError } from '../../../../ports/logging_ports';
import { parseVerifyCommand, type ParsedVerifyCommand } from './verify_command_policy';
import { VerificationPrerequisiteError } from '../../../../policies/verification_runtime_policy';
import { VerificationSetupError } from '../../../../policies/verification_setup_policy';
import { SourceDependencyError } from '../../../../policies/source_verification_dependency_policy';
import { VERIFICATION_COMMAND_LABELS, type VerificationFailure } from '../../../../../domain/verification_failure';

export interface VerifyCommandResult {
    success: boolean;
    failedCommand?: string;
    error?: string;
    failure?: VerificationFailure;
    safeError?: string;
}

export type VerifyCommandExecutor = (program: string, args: string[]) => Promise<number>;

export async function runVerifyCommands(
    commands: string[],
    execute: VerifyCommandExecutor,
): Promise<VerifyCommandResult> {
    for (const [index, command] of commands.entries()) {
        const result = await executeVerifyCommand(command, execute);
        if (!result.success) {
            const label = VERIFICATION_COMMAND_LABELS.find(value => value === command) ?? 'configured-command';
            return { ...result, failure: { stage: 'command', reason: 'command-failed', ...result.failure, command: label, commandIndex: index + 1 } };
        }
    }
    return { success: true };
}

async function executeVerifyCommand(
    command: string,
    execute: VerifyCommandExecutor,
): Promise<VerifyCommandResult> {
    const parsed = parseVerifyCommand(command);
    if (!parsed) return { ...invalidCommand(command), failure: diagnostic('command', 'command-invalid') };
    try {
        const exitCode = await execute(parsed.program, parsed.args);
        return exitCode === 0
            ? { success: true }
            : { success: false, failedCommand: formatCommandForDiagnostics(parsed) };
   } catch (error) {
        if (error instanceof SourceDependencyError) return { success: false, safeError: error.message, failure: diagnostic('dependencies', error.reason) };
        if (error instanceof VerificationPrerequisiteError || error instanceof VerificationSetupError) {
            return { success: false, safeError: error.message, failedCommand: formatCommandForDiagnostics(parsed),
                failure: error instanceof VerificationPrerequisiteError ? diagnostic('runtime', 'runtime-blocked') : diagnostic('repository-setup', 'setup-blocked'),
                error: `${error.message} Verification command: ${formatCommandForDiagnostics(parsed)}.` };
        }
        logError('Verify command failed.');
       return { success: false, failedCommand: formatCommandForDiagnostics(parsed) };
    }
}

function diagnostic(stage: VerificationFailure['stage'], reason: VerificationFailure['reason']): VerificationFailure {
    return { stage, reason, command: 'configured-command', commandIndex: 1 };
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

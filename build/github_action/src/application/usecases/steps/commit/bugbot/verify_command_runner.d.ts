export interface VerifyCommandResult {
    success: boolean;
    failedCommand?: string;
    error?: string;
}
export type VerifyCommandExecutor = (program: string, args: string[]) => Promise<number>;
export declare function runVerifyCommands(commands: string[], execute: VerifyCommandExecutor): Promise<VerifyCommandResult>;

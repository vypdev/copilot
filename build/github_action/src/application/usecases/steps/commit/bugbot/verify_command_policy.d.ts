export declare const MAX_VERIFY_COMMANDS = 20;
export interface ParsedVerifyCommand {
    program: string;
    args: string[];
}
export declare function parseVerifyCommand(cmd: string): ParsedVerifyCommand | null;
export declare function limitVerifyCommands(commands: unknown[]): string[];

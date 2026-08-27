export interface ParsedAgentCommand {
    executable: string;
    args: string[];
}
export declare function parseAgentCommand(command: string): ParsedAgentCommand;

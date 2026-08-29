export interface ParsedAgentCommand {
    executable: string;
    args: string[];
}
/** Parses a literal agent command without allowing shell operators or substitutions. */
export declare function parseAgentCommand(command: string): ParsedAgentCommand;

interface ActionInput {
    description: string;
    default: string;
}
interface ActionYaml {
    name: string;
    description: string;
    author: string;
    inputs: Record<string, ActionInput>;
}
/**
 * Resolves action.yml from the copilot package root, not cwd.
 * When run as CLI from another repo, cwd is that repo; action.yml lives next to the bundle.
 * - From source: __dirname is src/utils → ../../action.yml = repo root.
 * - From bundle (build/cli): __dirname is bundle dir → ../../action.yml = package root.
 */
export declare function loadActionYaml(): ActionYaml;
export declare function getActionInputs(): Record<string, ActionInput>;
export declare function getActionInputsWithDefaults(): Record<string, string>;
export {};

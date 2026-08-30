import type { AgentProvider } from '../../domain/agent';
export declare const SUPPORTED_AGENT_PROVIDERS: readonly AgentProvider[];
export declare function resolveAgentProvider(value: string): AgentProvider;
export declare function resolveModelProvider(value: string | undefined, environment: Record<string, string | undefined>): string;
export declare function resolveModel(value: string): string;
export declare function resolveEffort(value: string | undefined): string | undefined;
export declare function assertModelAllowlisted(modelProvider: string, model: string, environment: Record<string, string | undefined>): void;

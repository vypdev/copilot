import { buildAgentTasks, type AgentTaskConfigurationValues } from "../../actions/agent_configuration_builder";
import { DEFAULT_AGENT_MODEL, DEFAULT_AGENT_PROVIDER, DEFAULT_MODEL_PROVIDER } from "../../domain/agent";
import type { AgentTaskConfiguration } from "../../domain/agent";
import { cleanCliArgument } from "../command_input_policy";
import type { DoAgentOptions } from "./do_command_contracts";

export function buildDoAgentTasks(options: DoAgentOptions): AgentTaskConfiguration {
  return buildAgentTasks({
    provider: read(options.agentProvider, "AGENT_PROVIDER") || DEFAULT_AGENT_PROVIDER,
    modelProvider: read(options.agentModelProvider, "AGENT_MODEL_PROVIDER") || DEFAULT_MODEL_PROVIDER,
    model: read(options.agentModel, "AGENT_MODEL") || DEFAULT_AGENT_MODEL,
    effort: read(options.agentEffort, "AGENT_EFFORT"),
    command: read(options.agentCommand, "AGENT_COMMAND"),
    findings: buildTaskOverrides(options, "findings"),
    fixer: buildTaskOverrides(options, "fixer"),
  });
}

function buildTaskOverrides(
  options: DoAgentOptions,
  task: "findings" | "fixer",
): Partial<AgentTaskConfigurationValues> {
  const values = task === "findings"
    ? {
        provider: options.findingsProvider,
        modelProvider: options.findingsModelProvider,
        model: options.findingsModel,
        effort: options.findingsEffort,
        command: options.findingsCommand,
      }
    : {
        provider: options.fixerProvider,
        modelProvider: options.fixerModelProvider,
        model: options.fixerModel,
        effort: options.fixerEffort,
        command: options.fixerCommand,
      };
  const prefix = task.toUpperCase();
  return {
    provider: read(values.provider, `${prefix}_PROVIDER`),
    modelProvider: read(values.modelProvider, `${prefix}_MODEL_PROVIDER`),
    model: read(values.model, `${prefix}_MODEL`),
    effort: read(values.effort, `${prefix}_EFFORT`),
    command: read(values.command, `${prefix}_COMMAND`),
  };
}

function read(value: unknown, environmentName: string): string | undefined {
  return cleanCliArgument(value) || process.env[environmentName];
}

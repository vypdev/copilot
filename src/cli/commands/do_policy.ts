import { buildAgentTasks } from '../../actions/agent_configuration_builder';
import { DEFAULT_AGENT_MODEL, DEFAULT_AGENT_PROVIDER, DEFAULT_MODEL_PROVIDER } from '../../domain/agent';
import type { AgentTaskConfiguration } from '../../data/model/agent';
import { cleanCliArgument } from '../command_input_policy';

export interface DoAgentOptions {
  agentProvider?: string;
  agentModelProvider?: string;
  agentModel?: string;
  agentEffort?: string;
  agentCommand?: string;
  findingsProvider?: string;
  findingsModelProvider?: string;
  findingsEffort?: string;

  findingsModel?: string;
  findingsCommand?: string;
  fixerProvider?: string;
  fixerModelProvider?: string;
  fixerEffort?: string;

  fixerModel?: string;
  fixerCommand?: string;
}

export function buildDoAgentTasks(options: DoAgentOptions): AgentTaskConfiguration {

  const provider = cleanCliArgument(options.agentProvider) || process.env.AGENT_PROVIDER || DEFAULT_AGENT_PROVIDER;
  const modelProvider = cleanCliArgument(options.agentModelProvider) || process.env.AGENT_MODEL_PROVIDER || DEFAULT_MODEL_PROVIDER;
  const effort = cleanCliArgument(options.agentEffort) || process.env.AGENT_EFFORT;

  return buildAgentTasks({
    provider,
    modelProvider,

    model: cleanCliArgument(options.agentModel) || process.env.AGENT_MODEL || DEFAULT_AGENT_MODEL,
    effort,

    command: cleanCliArgument(options.agentCommand) || process.env.AGENT_COMMAND,
    findings: {
      provider: cleanCliArgument(options.findingsProvider) || process.env.FINDINGS_PROVIDER,
      modelProvider: cleanCliArgument(options.findingsModelProvider) || process.env.FINDINGS_MODEL_PROVIDER,
      model: cleanCliArgument(options.findingsModel) || process.env.FINDINGS_MODEL,
      effort: cleanCliArgument(options.findingsEffort) || process.env.FINDINGS_EFFORT,
      command: cleanCliArgument(options.findingsCommand) || process.env.FINDINGS_COMMAND,
    },
    fixer: {
      provider: cleanCliArgument(options.fixerProvider) || process.env.FIXER_PROVIDER,
      modelProvider: cleanCliArgument(options.fixerModelProvider) || process.env.FIXER_MODEL_PROVIDER,
      model: cleanCliArgument(options.fixerModel) || process.env.FIXER_MODEL,
      effort: cleanCliArgument(options.fixerEffort) || process.env.FIXER_EFFORT,
      command: cleanCliArgument(options.fixerCommand) || process.env.FIXER_COMMAND,
    },
  });
}

export function formatDoJsonResponse(text: string | undefined, sessionId?: string): string {
  return JSON.stringify({ response: text, sessionId }, null, 2);
}

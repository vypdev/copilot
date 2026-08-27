import { buildAgentTasks } from '../../actions/agent_configuration_builder';
import type { AgentTaskConfiguration } from '../../data/model/agent';
import { cleanCliArgument } from '../command_input_policy';

const DEFAULT_AGENT_PROVIDER = 'opencode';
const DEFAULT_MODEL_PROVIDER = 'openai';
const DEFAULT_AGENT_MODEL = 'gpt-5.6-luna';

export interface DoAgentOptions {
  agentProvider?: string;
  agentModelProvider?: string;
  agentModel?: string;
  agentCommand?: string;
  findingsProvider?: string;
  findingsModelProvider?: string;

  findingsModel?: string;
  findingsCommand?: string;
  fixerProvider?: string;
  fixerModelProvider?: string;

  fixerModel?: string;
  fixerCommand?: string;
}

export function buildDoAgentTasks(options: DoAgentOptions): AgentTaskConfiguration {

  const provider = cleanCliArgument(options.agentProvider) || process.env.AGENT_PROVIDER || DEFAULT_AGENT_PROVIDER;
  const modelProvider = cleanCliArgument(options.agentModelProvider) || process.env.AGENT_MODEL_PROVIDER || DEFAULT_MODEL_PROVIDER;

  return buildAgentTasks({
    provider,
    modelProvider,

    model: cleanCliArgument(options.agentModel) || process.env.AGENT_MODEL || DEFAULT_AGENT_MODEL,

    command: cleanCliArgument(options.agentCommand) || process.env.AGENT_COMMAND,
    findings: {
      provider: cleanCliArgument(options.findingsProvider),
      modelProvider: cleanCliArgument(options.findingsModelProvider),
      model: cleanCliArgument(options.findingsModel), command: cleanCliArgument(options.findingsCommand),
    },
    fixer: {
      provider: cleanCliArgument(options.fixerProvider),
      modelProvider: cleanCliArgument(options.fixerModelProvider),
      model: cleanCliArgument(options.fixerModel), command: cleanCliArgument(options.fixerCommand),
    },
  });
}

export function formatDoJsonResponse(text: string | undefined, sessionId?: string): string {
  return JSON.stringify({ response: text, sessionId }, null, 2);
}

import { buildAgentTasks } from '../../actions/agent_configuration_builder';
import { DEFAULT_AGENT_MODEL, DEFAULT_AGENT_PROVIDER, DEFAULT_MODEL_PROVIDER } from '../../domain/agent';
import type { AgentConfiguration, AgentTaskConfiguration } from '../../domain/agent';
import { cleanCliArgument, joinCliArguments } from '../command_input_policy';

export type DoOutputFormat = 'text' | 'json';

export type DoAuthenticationTask = 'findings' | 'fixer';

export interface DoAuthenticationPreflightResult {
  check: {
    status: 'available' | 'missing' | 'not_required';
    message: string;
  };
  mode: 'required' | 'warn' | 'disabled';
  shouldFail: boolean;
}

export type DoAuthenticationPreflight = (
  configuration: AgentConfiguration,
) => DoAuthenticationPreflightResult;

export interface DoAuthenticationNotice {
  task: DoAuthenticationTask;
  severity: 'error' | 'warning';
  message: string;
}

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

export function resolveDoPrompt(value: unknown): string | undefined {
  const prompt = joinCliArguments(value);
  return prompt.length > 0 ? prompt : undefined;
}

export function resolveDoOutputFormat(value: unknown): DoOutputFormat | undefined {
  const outputFormat = cleanCliArgument(value) || 'text';
  return outputFormat === 'text' || outputFormat === 'json' ? outputFormat : undefined;
}

/** Converts authentication preflight outcomes into CLI-neutral notices. */
export function collectDoAuthenticationNotices(
  agentTasks: AgentTaskConfiguration,
  runPreflight: DoAuthenticationPreflight,
): readonly DoAuthenticationNotice[] {
  const notices: DoAuthenticationNotice[] = [];
  for (const [task, configuration] of [['findings', agentTasks.findings], ['fixer', agentTasks.fixer] ] as const) {
    const preflight = runPreflight(configuration);
    if (preflight.check.status !== 'missing') continue;
    if (preflight.shouldFail) {
      notices.push({ task, severity: 'error', message: preflight.check.message });
    } else if (preflight.mode === 'warn') {
      notices.push({ task, severity: 'warning', message: preflight.check.message });
    }
  }
  return notices;
}

export function formatDoJsonResponse(text: string | undefined, sessionId?: string): string {
  return JSON.stringify({ response: text, sessionId }, null, 2);
}

export function formatDoTextResponse(text: string | undefined): string {
  return `
${'='.repeat(80)}
🤖 RESPONSE (selected agent build execution)
${'='.repeat(80)}

${text || '(No text response)'}

Changes are applied directly in the workspace by the selected agent CLI.`;
}

export function formatDoResponse(
  text: string | undefined,
  sessionId: string | undefined,
  outputFormat: DoOutputFormat,
): string {
  return outputFormat === 'json'
    ? formatDoJsonResponse(text, sessionId)
    : formatDoTextResponse(text);
}

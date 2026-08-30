import type { AgentConfiguration, AgentTaskConfiguration } from '../../domain/agent';
import { cleanCliArgument, joinCliArguments } from '../command_input_policy';

export { buildDoAgentTasks } from './do_agent_task_policy';
export type { DoAgentOptions } from './do_command_contracts';

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

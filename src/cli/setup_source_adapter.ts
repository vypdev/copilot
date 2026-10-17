import type { TerminalDriver } from '../application/ports/setup_terminal_ports';
import { SetupTerminalCancelledError } from './setup_credential_prompt_adapter';
import type { WebSetupBridge } from './web_setup_bridge';

/** The choice is an intent; authenticated inventory still decides whether reuse is possible. */
export async function chooseSetupConfigurationSource(terminal?: TerminalDriver, bridge?: WebSetupBridge, batch = false): Promise<'organization' | 'customize'> {
  const choices = ['Reuse organization configuration', 'Customize configuration'];
  const description = batch
    ? 'Reuse compatible organization settings to skip completed questions, or customize repository settings. Batch setup keeps existing Secret bindings in both paths. Provision missing credentials separately, then inspect again; shared values are never replaced.'
    : 'Reuse compatible organization Variables and existing Secret bindings, keeping repository overrides. Only missing, invalid or repository-specific settings are asked again. Shared values are preserved; reviewed differences become repository overrides. Choose Customize to provision or replace credentials.';
  if (bridge) {
    const answer = await bridge.ask({ kind: 'choice', title: 'Where should configuration come from?',
      description, choices, defaultValue: choices[1], copyId: batch ? 'setup.batchSource' : 'setup.source' });
    if (answer === undefined) throw new SetupTerminalCancelledError();
    return answer === choices[0] ? 'organization' : 'customize';
  }
  if (!terminal?.isInteractive()) return 'customize';
  for (;;) {
    const answer = await terminal.readText(`${description}\n1. ${choices[0]}\n2. ${choices[1]}\nChoose 1 or 2 [2]: `);
    if (answer.kind !== 'value') throw new SetupTerminalCancelledError();
    if (answer.value.trim() === '1') return 'organization';
    if (answer.value.trim() === '' || answer.value.trim() === '2') return 'customize';
  }
}

export async function chooseWebSetupScope(bridge: WebSetupBridge): Promise<'current' | 'selected'> {
  const choices = ['This repository', 'Several repositories in this organization'];
  const answer = await bridge.ask({ kind: 'choice', title: 'Choose setup scope', choices,
    defaultValue: choices[0], copyId: 'setup.scope' });
  if (answer === undefined) throw new SetupTerminalCancelledError();
  return answer === choices[1] ? 'selected' : 'current';
}

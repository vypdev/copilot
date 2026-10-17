import { chooseSetupConfigurationSource, chooseWebSetupScope } from '../setup_source_adapter';
import { SetupTerminalCancelledError } from '../setup_credential_prompt_adapter';
import type { TerminalDriver } from '../../application/ports/setup_terminal_ports';
import type { WebSetupBridge } from '../web_setup_bridge';
function terminal(values: readonly string[]): TerminalDriver {
  const read = jest.fn(); for (const value of values) read.mockResolvedValueOnce({ kind: 'value', value });
  return { isInteractive: () => true, readText: read, readSecret: jest.fn(), close: jest.fn() };
}
describe('shared configuration source intent presentation', () => {
  it('preserves legacy default without an interactive presentation', async () => {
    expect(await chooseSetupConfigurationSource()).toBe('customize');
  });
  it.each([{ input: '1', source: 'organization' }, { input: '2', source: 'customize' }, { input: '', source: 'customize' }])('maps terminal intent $input', async ({ input, source }) => {
    expect(await chooseSetupConfigurationSource(terminal([input]))).toBe(source);
  });
  it('reasks invalid terminal input without turning it into approval', async () => {
    const driver = terminal(['yes', 'all', '1']);
    expect(await chooseSetupConfigurationSource(driver)).toBe('organization');
    expect(driver.readText).toHaveBeenCalledTimes(3);
  });
  it.each([{ answer: 'Reuse organization configuration', source: 'organization' }, { answer: 'Customize configuration', source: 'customize' }])('uses the same web intent $source', async ({ answer, source }) => {
    const ask = jest.fn().mockResolvedValue(answer);
    expect(await chooseSetupConfigurationSource(undefined, { ask } as unknown as WebSetupBridge)).toBe(source);
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ copyId: 'setup.source', defaultValue: 'Customize configuration' }));
  });
  it('names the limited Customize behavior explicitly in batch selection', async () => {
    const ask = jest.fn().mockResolvedValue('Customize settings; keep existing Secrets');
    expect(await chooseSetupConfigurationSource(undefined, { ask } as unknown as WebSetupBridge, true)).toBe('customize');
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ copyId: 'setup.batchSource', choices: ['Reuse organization configuration', 'Customize settings; keep existing Secrets'] }));
  });
  it('keeps web cancellation distinct from Customize', async () => {
    await expect(chooseSetupConfigurationSource(undefined, { ask: async () => undefined } as unknown as WebSetupBridge))
      .rejects.toBeInstanceOf(SetupTerminalCancelledError);
  });
  it('treats terminal interruption as cancellation, without selecting Customize', async () => {
    const driver = terminal([]); jest.mocked(driver.readText).mockResolvedValue({ kind: 'cancel' });
    await expect(chooseSetupConfigurationSource(driver)).rejects.toBeInstanceOf(SetupTerminalCancelledError);
  });
  it.each(['This repository', 'Several repositories in this organization'])('maps an explicit browser scope: %s', async answer => {
    const ask = jest.fn().mockResolvedValue(answer);
    expect(await chooseWebSetupScope({ ask } as unknown as WebSetupBridge)).toBe(answer === 'This repository' ? 'current' : 'selected');
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ copyId: 'setup.scope', defaultValue: 'This repository' }));
  });
  it('keeps scope cancellation distinct from a single-repository selection', async () => {
    await expect(chooseWebSetupScope({ ask: async () => undefined } as unknown as WebSetupBridge)).rejects.toBeInstanceOf(SetupTerminalCancelledError);
  });
});

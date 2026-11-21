import { Command } from 'commander';
import { registerSetupCommand } from '../commands/setup';
import { executeSetupCommand } from '../commands/setup_execution';
import { executeSetupPublisherCommand } from '../setup_publisher_installation_adapter';
import { createInteractiveTerminalDriver } from '../setup_terminal_driver';
import { createCliProgram } from '../cli_program';

jest.mock('../setup_publisher_installation_adapter', () => ({ executeSetupPublisherCommand: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../actions/local_action', () => ({ runLocalAction: jest.fn(() => { throw new Error('generic-action-sentinel'); }) }));
jest.mock('../command_registry', () => ({ registerCliCommands: (root: Command) => { registerSetupCommand(root); return root; } }));
jest.mock('../setup_terminal_driver', () => ({ createInteractiveTerminalDriver: jest.fn(() => { throw new Error('legacy-terminal-sentinel'); }) }));

beforeEach(() => { jest.clearAllMocks(); });
function program() { const root = new Command().exitOverride(); registerSetupCommand(root); return root; }
it('registers the supported route and dispatches before generic terminal, configuration and web orchestration', async () => {
  const root = program(); await root.parseAsync(['setup', '--publisher-manifest', 'proposal.json', '--dry-run'], { from: 'user' });
  expect(executeSetupPublisherCommand).toHaveBeenCalledWith({ proposalPath: 'proposal.json', explicitOptions: expect.arrayContaining(['publisherManifest', 'dryRun']), token: undefined, dryRun: true, resumeOperation: undefined });
  const input = jest.mocked(executeSetupPublisherCommand).mock.calls[0][0]; expect(input.explicitOptions).not.toContain('web'); expect(input.explicitOptions).not.toContain('debug');
  expect(createInteractiveTerminalDriver).not.toHaveBeenCalled();
  expect(root.commands.find(command => command.name() === 'setup')!.helpInformation()).toContain('--publisher-manifest');
});
it.each([
  ['web', false], ['batch', false], ['yes', false], ['nonInteractive', false], ['skipSecrets', false], ['features', ''], ['config', ''], ['agentGuidance', 'create-if-missing'],
] as const)('retains explicit %s provenance even for false, empty or default-looking values', async (key, value) => {
  const root = program(), setup = root.commands.find(command => command.name() === 'setup')!;
  setup.setOptionValueWithSource(key, value, 'cli');
  await root.parseAsync(['setup', '--publisher-manifest', 'proposal.json'], { from: 'user' });
  expect(jest.mocked(executeSetupPublisherCommand).mock.calls[0][0].explicitOptions).toContain(key);
  expect(createInteractiveTerminalDriver).not.toHaveBeenCalled();
});
it('preserves the explicit empty token and resume identity instead of applying environment fallback', async () => {
  const root = program(), id = '11111111-1111-4111-8111-111111111111';
  await root.parseAsync(['setup', '--publisher-manifest', 'proposal.json', '--token', '', '--resume-operation', id, '--debug'], { from: 'user' });
  expect(executeSetupPublisherCommand).toHaveBeenCalledWith(expect.objectContaining({ token: '', resumeOperation: id,
    explicitOptions: expect.arrayContaining(['publisherManifest', 'token', 'resumeOperation', 'debug']) }));
});
it('an ordinary bare resume keeps the existing batch dispatch', async () => {
  const root = program();
  await expect(root.parseAsync(['setup', '--resume-operation', '11111111-1111-4111-8111-111111111111'], { from: 'user' })).rejects.toThrow('legacy-terminal-sentinel');
  expect(executeSetupPublisherCommand).not.toHaveBeenCalled(); expect(createInteractiveTerminalDriver).toHaveBeenCalledTimes(1);
});
it('a programmatic route has no invented Commander approval provenance', async () => {
  await executeSetupCommand({ publisherManifest: 'proposal.json' });
  expect(executeSetupPublisherCommand).toHaveBeenCalledWith(expect.objectContaining({ explicitOptions: [] }));
  expect(createInteractiveTerminalDriver).not.toHaveBeenCalled();
});
it('a missing callback value cannot fall through to generic setup when Commander retains explicit publisher intent', async () => {
  const root = program(), command = root.commands.find(item => item.name() === 'setup')!;
  command.setOptionValueWithSource('publisherManifest', 'proposal.json', 'cli');
  await executeSetupCommand({}, command);
  expect(executeSetupPublisherCommand).toHaveBeenCalledWith(expect.objectContaining({ proposalPath: undefined, explicitOptions: ['publisherManifest'] }));
  expect(createInteractiveTerminalDriver).not.toHaveBeenCalled();
});
it('a programmatic ordinary setup keeps the generic route without inventing a publisher selection', async () => {
  await expect(executeSetupCommand({})).rejects.toThrow('legacy-terminal-sentinel'); expect(executeSetupPublisherCommand).not.toHaveBeenCalled();
});
it('bypasses provider update discovery before publisher admission without a new product flag', async () => {
  const checker = { execute: jest.fn(async () => undefined) }, root = createCliProgram(checker).exitOverride();
  await root.parseAsync(['setup', '--publisher-manifest', 'invalid-local-proposal.json', '--dry-run'], { from: 'user' });
  expect(checker.execute).not.toHaveBeenCalled(); expect(executeSetupPublisherCommand).toHaveBeenCalled();
});
it('keeps ordinary setup update discovery and the existing terminal route', async () => {
  const saved = process.env.COPILOT_DISABLE_UPDATE_CHECK; delete process.env.COPILOT_DISABLE_UPDATE_CHECK;
  try {
    const checker = { execute: jest.fn(async () => undefined) }, root = createCliProgram(checker).exitOverride();
    await expect(root.parseAsync(['setup'], { from: 'user' })).rejects.toThrow('legacy-terminal-sentinel');
    expect(checker.execute).toHaveBeenCalledTimes(1); expect(executeSetupPublisherCommand).not.toHaveBeenCalled();
  } finally { if (saved === undefined) delete process.env.COPILOT_DISABLE_UPDATE_CHECK; else process.env.COPILOT_DISABLE_UPDATE_CHECK = saved; }
});
it.each([undefined, 'default'] as const)('an unset Commander value with source %s retains ordinary setup and update discovery', async source => {
  const saved = process.env.COPILOT_DISABLE_UPDATE_CHECK; delete process.env.COPILOT_DISABLE_UPDATE_CHECK;
  try {
    const checker = { execute: jest.fn(async () => undefined) }, root = createCliProgram(checker).exitOverride();
    const setup = root.commands.find(command => command.name() === 'setup')!;
    if (source === undefined) setup.setOptionValue('publisherManifest', undefined);
    else setup.setOptionValueWithSource('publisherManifest', undefined, source);
    await expect(root.parseAsync(['setup'], { from: 'user' })).rejects.toThrow('legacy-terminal-sentinel');
    expect(checker.execute).toHaveBeenCalledTimes(1); expect(executeSetupPublisherCommand).not.toHaveBeenCalled();
  } finally { if (saved === undefined) delete process.env.COPILOT_DISABLE_UPDATE_CHECK; else process.env.COPILOT_DISABLE_UPDATE_CHECK = saved; }
});
it.each(['config', 'env', 'implied'] as const)('an invalid undefined publisher selection from %s still stops before provider updates or generic setup', async source => {
  const checker = { execute: jest.fn(async () => undefined) }, root = createCliProgram(checker).exitOverride();
  root.commands.find(command => command.name() === 'setup')!.setOptionValueWithSource('publisherManifest', undefined, source);
  await root.parseAsync(['setup'], { from: 'user' });
  expect(checker.execute).not.toHaveBeenCalled(); expect(createInteractiveTerminalDriver).not.toHaveBeenCalled();
  expect(executeSetupPublisherCommand).toHaveBeenCalledWith(expect.objectContaining({ proposalPath: undefined, explicitOptions: [] }));
});
it('an explicitly present undefined programmatic publisher input cannot fall through to ordinary setup', async () => {
  await executeSetupCommand({ publisherManifest: undefined });
  expect(executeSetupPublisherCommand).toHaveBeenCalledWith(expect.objectContaining({ proposalPath: undefined, explicitOptions: [] }));
  expect(createInteractiveTerminalDriver).not.toHaveBeenCalled();
});
it('keeps update discovery for unrelated commands', async () => {
  const saved = process.env.COPILOT_DISABLE_UPDATE_CHECK; delete process.env.COPILOT_DISABLE_UPDATE_CHECK;
  try {
    const checker = { execute: jest.fn(async () => undefined) }, root = createCliProgram(checker).exitOverride();
    root.command('sentinel').action(() => undefined); await root.parseAsync(['sentinel'], { from: 'user' });
    expect(checker.execute).toHaveBeenCalledTimes(1); expect(executeSetupPublisherCommand).not.toHaveBeenCalled();
  } finally { if (saved === undefined) delete process.env.COPILOT_DISABLE_UPDATE_CHECK; else process.env.COPILOT_DISABLE_UPDATE_CHECK = saved; }
});
it('even an invalid non-CLI publisher selection reaches admission before update-provider reads', async () => {
  const checker = { execute: jest.fn(async () => undefined) }, root = createCliProgram(checker).exitOverride();
  root.commands.find(command => command.name() === 'setup')!.setOptionValueWithSource('publisherManifest', 'proposal.json', 'config');
  await root.parseAsync(['setup'], { from: 'user' });
  expect(checker.execute).not.toHaveBeenCalled(); expect(executeSetupPublisherCommand).toHaveBeenCalledWith(expect.objectContaining({ explicitOptions: [] }));
});

import { Command } from 'commander';
import { registerDoCommand } from '../do';

describe('do command adapter', () => {
  it('registers the provider-neutral execution options', () => {
    const program = new Command();
    registerDoCommand(program);

    const command = program.commands.find((candidate) => candidate.name() === 'do');

    expect(command).toBeDefined();
    expect(command?.description()).toContain('AI development assistant');
    expect(command?.options.map(({ long }) => long)).toEqual(expect.arrayContaining([
      '--prompt',
      '--agent-provider',
      '--agent-model-provider',
      '--agent-model',
      '--agent-effort',
      '--findings-provider',
      '--fixer-provider',
      '--output',
    ]));
  });
});

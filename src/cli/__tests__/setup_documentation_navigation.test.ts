import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { SETUP_DOCUMENTATION } from '../../application/contracts/setup_documentation';
import { buildSetupJourneyView } from '../../application/policies/setup_journey_policy';
import { ConsoleSetupJourneyPresenter } from '../setup_journey_presenter';
import { registerSetupCommand } from '../commands/setup';
import { executeSetupCommand } from '../commands/setup_execution';
import { useWebSetupRenderer } from '../../../test-support/web-setup-renderer';

jest.mock('../commands/setup_execution', () => ({ executeSetupCommand: jest.fn() }));

const markup = useWebSetupRenderer();

describe('setup documentation navigation', () => {
  test.each([
    ['en', 'Setup tutorial', 'new tab'],
    ['es', 'Tutorial de configuración', 'otra pestaña'],
    ['fr', 'Tutoriel de configuration', 'nouvel onglet'],
    ['pt', 'Tutorial de configuração', 'novo separador'],
  ])('%s provides non-mutating, localized help navigation before pairing', async (locale, title, hint) => {
    const html = await markup('SetupHelp', {}, locale);
    expect(html).toContain('<nav');
    expect(html).toContain('aria-label=');
    expect(html).toContain(title);
    expect(html).toContain(hint);
    for (const url of Object.values(SETUP_DOCUMENTATION)) expect(html).toContain(`href="${url}"`);
    expect(html.match(/target="_blank" rel="noopener noreferrer"/gu)).toHaveLength(3);
    expect(html).not.toContain('<button');
  });

  test.each(['complete', 'dry-run', 'partial', 'blocked'] as const)(
    '%s only claims the next installed-workflow step after a completed Apply', async outcome => {
      const html = await markup('ResultPanel', { outcome, controller: false });
      expect(html.includes(`href="${SETUP_DOCUMENTATION.firstWorkflow}"`)).toBe(outcome === 'complete');
      expect(html.includes('Install the reviewed files')).toBe(outcome === 'complete');
    },
  );

  test.each([
    ['repository', undefined, SETUP_DOCUMENTATION.tutorial],
    ['apply', 'complete', SETUP_DOCUMENTATION.firstWorkflow],
    ['apply', 'partial', SETUP_DOCUMENTATION.recovery],
    ['setup-pat', 'blocked', SETUP_DOCUMENTATION.recovery],
    ['plan', 'dry-run', SETUP_DOCUMENTATION.tutorial],
  ] as const)('CLI %s / %s offers the appropriate next guide', (stage, outcome, url) => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      new ConsoleSetupJourneyPresenter().present(buildSetupJourneyView('owner/repo', stage, outcome === 'complete' || outcome === 'partial', outcome));
      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain(url);
      if (outcome !== 'complete') expect(output).not.toContain(SETUP_DOCUMENTATION.firstWorkflow);
    } finally { log.mockRestore(); }
  });

  test('setup --help exposes the tutorial and verification path without executing setup', () => {
    let output = '';
    const program = new Command();
    registerSetupCommand(program);
    const setup = program.commands.find(command => command.name() === 'setup')!;
    setup.configureOutput({ writeOut: value => { output += value; } });
    setup.outputHelp();
    expect(output).toContain('--web');
    expect(output).toContain('type ?');
    for (const url of Object.values(SETUP_DOCUMENTATION)) expect(output).toContain(url);
    expect(executeSetupCommand).not.toHaveBeenCalled();
  });

  test('every shared guide is a registered local page with a clean public URL', () => {
    const root = resolve(__dirname, '../../..');
    const navigation = readFileSync(resolve(root, 'docs.json'), 'utf8');
    for (const destination of Object.values(SETUP_DOCUMENTATION)) {
      const url = new URL(destination);
      expect(url.origin).toBe('https://docs.page');
      expect(url.search + url.username + url.password).toBe('');
      const route = url.pathname.replace('/vypdev/copilot', '');
      expect(navigation).toContain(`"${route}"`);
      expect(existsSync(resolve(root, 'docs', `${route.slice(1)}.mdx`))).toBe(true);
    }
  });
});

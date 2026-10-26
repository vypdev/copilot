import { ApplicationError } from '../../errors/application_error';
import { COPILOT_COMMAND_NAMES, parseCopilotCommand } from '../../../domain/copilot_command';
import { buildApplicationErrorPresentation, renderApplicationErrorMarkdown, renderApplicationErrorText } from '../application_error_presentation_policy';
import { resolveApplicationErrorCatalog, resolveStaticApplicationErrorCatalog, ENGLISH_APPLICATION_ERROR_DEFINITION } from '../application_error_message_catalog';
import { commandValidationPresentationVariables } from '../comment_command_validation_presentation_policy';
import { ResolveMessageCatalogUseCase } from '../../usecases/localization/resolve_message_catalog_use_case';
import { buildCopilotHelpMessage } from '../copilot_interaction_policy';

const configuration = { provider: 'codex' as const, model: 'model' };
const error = () => new ApplicationError('validation.invalid-input', 'PRIVATE_INPUT', {
  recovery: { id: 'comment-command-argument-count', variables: { command: 'recheck' } },
});

describe('localized safe command recovery', () => {
  it.each(['en-US', 'en-AU', 'es-ES', 'es-MX'])('renders reviewed built-in recovery for %s', locale => {
    const message = resolveStaticApplicationErrorCatalog(locale).message;
    const view = buildApplicationErrorPresentation(error(), message);
    const markdown = renderApplicationErrorMarkdown(error(), message);
    const text = renderApplicationErrorText(error(), message);
    expect(view.impact).toContain('20');
    expect(view.action).toContain('`/copilot recheck`');
    expect(markdown).not.toContain('PRIVATE_INPUT');
    expect(text).toContain(view.impact);
    expect(buildCopilotHelpMessage('vypbot', locale)).toContain(locale.startsWith('es') ? 'clave=valor' : 'key=value');
  });

  it.each(['fr-FR', 'de-DE', 'ar-SA', 'ja-JP'])('localizes %s atomically and protects executable examples after translation', async locale => {
    const messages = Object.fromEntries(Object.entries(ENGLISH_APPLICATION_ERROR_DEFINITION.messages)
      .map(([id, value]) => [id, 'Translated ' + value]));
    const query = jest.fn().mockResolvedValue({ targetLocale: locale, messages });
    const resolver = new ResolveMessageCatalogUseCase({ query });
    const first = await resolveApplicationErrorCatalog(locale, configuration, resolver);
    const replay = await resolveApplicationErrorCatalog(locale, configuration, resolver);
    const failure = error();
    const rendered = buildApplicationErrorPresentation(failure, first.message);
    expect(first).toMatchObject({ locale, resolutionSource: 'dynamic' });
    expect(rendered.impact).toContain('Translated ');
    expect(rendered.action).toContain('`/copilot recheck`');
    expect(rendered.action).toContain('https://docs.page/vypdev/copilot/issues/comment-commands');
    expect(buildApplicationErrorPresentation(failure, replay.message)).toEqual(rendered);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('falls back as a whole when a command diagnostic translation is incomplete', async () => {
    const messages = { ...ENGLISH_APPLICATION_ERROR_DEFINITION.messages };
    delete (messages as Record<string, unknown>)['error.recovery.comment-command-argument-count.action'];
    const resolver = new ResolveMessageCatalogUseCase({ query: jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages }) });
    const catalog = await resolveApplicationErrorCatalog('fr-FR', configuration, resolver);
    expect(catalog).toMatchObject({ locale: 'en-US', resolutionSource: 'fallback' });
    expect(buildApplicationErrorPresentation(error(), catalog.message).action).toContain('/copilot recheck');
  });

  it.each(COPILOT_COMMAND_NAMES)('derives syntactically valid examples from the fixed %s command vocabulary', command => {
    const example = commandValidationPresentationVariables('comment-command-argument-count', command).commandExample.slice(1, -1);
    expect(parseCopilotCommand(example)).toMatchObject({ kind: 'command' });
    expect(example).toContain('/copilot ' + command);
  });

  it.each(['comment-command-review-format', 'comment-command-review-effort', 'comment-command-review-boolean', 'comment-command-review-option'] as const)('keeps %s examples executable', reason => {
    expect(commandValidationPresentationVariables(reason, 'recheck').commandExample)
      .toBe('`/copilot recheck ' + (reason === 'comment-command-review-boolean' ? 'dry-run=true' : 'effort=smart') + '`');
  });

  it('uses quoted finding identifiers only in the appropriate recovery examples', () => {
    for (const command of ['fix', 'dismiss']) {
      expect(parseCopilotCommand(commandValidationPresentationVariables('comment-command-finding-quoting', command).commandExample.slice(1, -1)))
        .toMatchObject({ kind: 'command', command: { arguments: ['path:line:finding with spaces'] } });
    }
    for (const command of [null, 'PRIVATE_INPUT', '__proto__', 42]) {
      expect(commandValidationPresentationVariables('comment-command-length', command).commandExample).toBe('`/copilot help`');
    }
  });

  it.each([
    { id: 'comment-command-length', variables: { command: 'recheck' } },
    { id: 'comment-command-review-effort', variables: { command: 'sync-branch' } },
    { id: 'comment-command-length', variables: { command: 'PRIVATE_INPUT' } },
    { id: 'comment-command-length', variables: {} },
    { id: 'comment-command-length', variables: { command: 'help', raw: 'PRIVATE_INPUT' } },
  ])('rejects forged recovery data instead of rendering user input: $id $variables', recovery => {
    expect(() => new ApplicationError('validation.invalid-input', 'Invalid.', { recovery: recovery as never })).toThrow();
  });
});
